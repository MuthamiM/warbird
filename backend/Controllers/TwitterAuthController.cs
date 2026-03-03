using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using WarbirdApi.Data;
using WarbirdApi.Models;
using WarbirdApi.Models.DTOs;

namespace WarbirdApi.Controllers;

[ApiController]
[Route("api/auth/twitter")]
[EnableRateLimiting("fixed")]
public class TwitterAuthController : ControllerBase
{
    private readonly WarbirdDbContext _db;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;
    private static readonly Dictionary<string, PkceChallenge> _pendingChallenges = new();

    public TwitterAuthController(WarbirdDbContext db, IConfiguration config, IHttpClientFactory httpFactory)
    {
        _db = db;
        _config = config;
        _httpFactory = httpFactory;
    }

    /// <summary>
    /// Start Twitter OAuth 2.0 PKCE flow — returns the authorization URL
    /// Frontend redirects the user to this URL
    /// </summary>
    [HttpGet("authorize")]
    public ActionResult Authorize([FromQuery] string? returnUrl)
    {
        var clientId = _config["Twitter:ClientId"];
        if (string.IsNullOrEmpty(clientId))
            return BadRequest(new ApiResponse(false, "Twitter OAuth not configured. Set Twitter:ClientId in appsettings.json"));

        var redirectUri = _config["Twitter:RedirectUri"] ?? $"{Request.Scheme}://{Request.Host}/api/auth/twitter/callback";

        // Generate PKCE challenge
        var codeVerifier = GenerateCodeVerifier();
        var codeChallenge = GenerateCodeChallenge(codeVerifier);
        var state = Guid.NewGuid().ToString("N");

        // Store for callback verification (with 10-min expiry)
        _pendingChallenges[state] = new PkceChallenge(codeVerifier, returnUrl ?? "/", DateTime.UtcNow.AddMinutes(10));
        CleanExpiredChallenges();

        var authUrl = "https://twitter.com/i/oauth2/authorize" +
            $"?response_type=code" +
            $"&client_id={Uri.EscapeDataString(clientId)}" +
            $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
            $"&scope={Uri.EscapeDataString("tweet.read users.read offline.access")}" +
            $"&state={state}" +
            $"&code_challenge={codeChallenge}" +
            $"&code_challenge_method=S256";

        return Ok(new { authUrl, state });
    }

    /// <summary>
    /// Twitter OAuth callback — exchanges auth code for access token and fetches user info
    /// </summary>
    [HttpGet("callback")]
    public async Task<ActionResult> Callback([FromQuery] string code, [FromQuery] string state)
    {
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            return BadRequest("Missing code or state parameter.");

        if (!_pendingChallenges.TryGetValue(state, out var challenge))
            return BadRequest("Invalid or expired state. Please try again.");

        if (challenge.ExpiresAt < DateTime.UtcNow)
        {
            _pendingChallenges.Remove(state);
            return BadRequest("Authorization expired. Please try again.");
        }

        _pendingChallenges.Remove(state);

        var clientId = _config["Twitter:ClientId"]!;
        var redirectUri = _config["Twitter:RedirectUri"] ?? $"{Request.Scheme}://{Request.Host}/api/auth/twitter/callback";

        // Exchange code for access token
        var tokenResult = await ExchangeCodeForToken(clientId, code, redirectUri, challenge.CodeVerifier);
        if (tokenResult == null)
            return BadRequest("Failed to exchange authorization code. Please try again.");

        // Fetch user info from Twitter API
        var twitterUser = await FetchTwitterUser(tokenResult.AccessToken);
        if (twitterUser == null)
            return BadRequest("Failed to fetch Twitter user info.");

        // Find or create user in our DB
        var user = await _db.Users.FirstOrDefaultAsync(u => u.XHandle == twitterUser.Username);
        if (user == null)
        {
            // Create new user from Twitter auth
            user = new User
            {
                Username = twitterUser.Username.ToLowerInvariant(),
                Email = $"{twitterUser.Username}@twitter.warbird",  // placeholder email
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()), // random password
                XHandle = twitterUser.Username,
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        else
        {
            user.LastLoginAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        // Redirect to frontend with user data encoded in URL fragment
        var userData = JsonSerializer.Serialize(new
        {
            success = true,
            platform = "x",
            user = new
            {
                id = user.Id,
                username = twitterUser.Username,
                displayName = twitterUser.Name,
                profileImage = twitterUser.ProfileImageUrl,
                verified = true
            }
        });

        var frontendUrl = _config["Frontend:Url"] ?? "https://muthamim.github.io/warbird";
        var encodedData = Convert.ToBase64String(Encoding.UTF8.GetBytes(userData));
        return Redirect($"{frontendUrl}?auth_callback=twitter&data={encodedData}");
    }

    private async Task<TwitterTokenResponse?> ExchangeCodeForToken(string clientId, string code, string redirectUri, string codeVerifier)
    {
        try
        {
            var client = _httpFactory.CreateClient();
            var body = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
                ["client_id"] = clientId,
                ["code_verifier"] = codeVerifier
            });

            var response = await client.PostAsync("https://api.twitter.com/2/oauth2/token", body);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<TwitterTokenResponse>(json, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
            });
            return result;
        }
        catch
        {
            return null;
        }
    }

    private async Task<TwitterUserInfo?> FetchTwitterUser(string accessToken)
    {
        try
        {
            var client = _httpFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync("https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username");
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var data = doc.RootElement.GetProperty("data");

            return new TwitterUserInfo(
                data.GetProperty("id").GetString()!,
                data.GetProperty("username").GetString()!,
                data.GetProperty("name").GetString()!,
                data.TryGetProperty("profile_image_url", out var img) ? img.GetString() : null
            );
        }
        catch
        {
            return null;
        }
    }

    private static string GenerateCodeVerifier()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string GenerateCodeChallenge(string verifier)
    {
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(verifier));
        return Convert.ToBase64String(hash)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static void CleanExpiredChallenges()
    {
        var expired = _pendingChallenges.Where(kv => kv.Value.ExpiresAt < DateTime.UtcNow).Select(kv => kv.Key).ToList();
        foreach (var key in expired) _pendingChallenges.Remove(key);
    }

    private record PkceChallenge(string CodeVerifier, string ReturnUrl, DateTime ExpiresAt);
    private record TwitterTokenResponse(string AccessToken, string TokenType, long ExpiresIn, string Scope);
    private record TwitterUserInfo(string Id, string Username, string Name, string? ProfileImageUrl);
}
