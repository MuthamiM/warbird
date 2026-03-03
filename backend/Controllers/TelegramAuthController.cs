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
[Route("api/auth/telegram")]
[EnableRateLimiting("fixed")]
public class TelegramAuthController : ControllerBase
{
    private readonly WarbirdDbContext _db;
    private readonly IConfiguration _config;

    public TelegramAuthController(WarbirdDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    /// <summary>
    /// Returns the Telegram Bot username for the Login Widget
    /// </summary>
    [HttpGet("bot-info")]
    public ActionResult GetBotInfo()
    {
        var botUsername = _config["Telegram:BotUsername"];
        if (string.IsNullOrEmpty(botUsername))
            return BadRequest(new ApiResponse(false, "Telegram Bot not configured. Set Telegram:BotUsername in appsettings.json"));

        // Extract numeric bot ID from the token (format: "BOTID:SECRET")
        var botToken = _config["Telegram:BotToken"] ?? "";
        var botId = botToken.Contains(':') ? botToken.Split(':')[0] : "";

        return Ok(new { botUsername, botId });
    }

    /// <summary>
    /// Verify Telegram Login Widget data
    /// The Telegram widget sends auth data with an HMAC-SHA256 hash
    /// We verify the hash using our bot token to ensure authenticity
    /// </summary>
    [HttpPost("verify")]
    public async Task<ActionResult> Verify([FromBody] TelegramAuthData authData)
    {
        var botToken = _config["Telegram:BotToken"];
        if (string.IsNullOrEmpty(botToken))
            return BadRequest(new ApiResponse(false, "Telegram Bot not configured."));

        // Validate the auth_date is recent (within 1 hour)
        if (authData.AuthDate <= 0)
            return BadRequest(new ApiResponse(false, "Invalid auth_date."));

        var authTime = DateTimeOffset.FromUnixTimeSeconds(authData.AuthDate);
        if ((DateTimeOffset.UtcNow - authTime).TotalHours > 1)
            return BadRequest(new ApiResponse(false, "Telegram authentication expired. Please try again."));

        // Verify the hash using HMAC-SHA256
        if (!VerifyTelegramHash(authData, botToken))
            return Unauthorized(new ApiResponse(false, "Invalid Telegram authentication data."));

        // Auth is valid — find or create user
        var username = authData.Username ?? $"tg_{authData.Id}";
        var user = await _db.Users.FirstOrDefaultAsync(u => u.TelegramHandle == username);

        if (user == null)
        {
            // Create new user from Telegram auth
            user = new User
            {
                Username = username.ToLowerInvariant(),
                Email = $"{username}@telegram.warbird", // placeholder email
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
                TelegramHandle = username,
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

        return Ok(new
        {
            success = true,
            platform = "telegram",
            user = new
            {
                id = user.Id,
                username,
                displayName = $"{authData.FirstName} {authData.LastName}".Trim(),
                profileImage = authData.PhotoUrl,
                verified = true
            }
        });
    }

    /// <summary>
    /// Verifies Telegram Login Widget hash using HMAC-SHA256
    /// See: https://core.telegram.org/widgets/login#checking-authorization
    /// </summary>
    private static bool VerifyTelegramHash(TelegramAuthData data, string botToken)
    {
        // Build the data-check-string (sorted key=value pairs, excluding hash)
        var fields = new SortedDictionary<string, string>();
        if (data.Id > 0) fields["id"] = data.Id.ToString();
        if (!string.IsNullOrEmpty(data.FirstName)) fields["first_name"] = data.FirstName;
        if (!string.IsNullOrEmpty(data.LastName)) fields["last_name"] = data.LastName;
        if (!string.IsNullOrEmpty(data.Username)) fields["username"] = data.Username;
        if (!string.IsNullOrEmpty(data.PhotoUrl)) fields["photo_url"] = data.PhotoUrl;
        if (data.AuthDate > 0) fields["auth_date"] = data.AuthDate.ToString();

        var dataCheckString = string.Join("\n", fields.Select(kv => $"{kv.Key}={kv.Value}"));

        // Secret key = SHA256(bot_token)
        var secretKey = SHA256.HashData(Encoding.UTF8.GetBytes(botToken));

        // Hash = HMAC-SHA256(data_check_string, secret_key)
        using var hmac = new HMACSHA256(secretKey);
        var computedHash = hmac.ComputeHash(Encoding.UTF8.GetBytes(dataCheckString));
        var computedHex = Convert.ToHexStringLower(computedHash);

        return computedHex == data.Hash?.ToLowerInvariant();
    }
}

/// <summary>
/// Data returned by Telegram Login Widget
/// </summary>
public record TelegramAuthData
{
    public long Id { get; init; }
    public string? FirstName { get; init; }
    public string? LastName { get; init; }
    public string? Username { get; init; }
    public string? PhotoUrl { get; init; }
    public long AuthDate { get; init; }
    public string? Hash { get; init; }
}
