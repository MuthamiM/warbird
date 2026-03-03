using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using WarbirdApi.Data;
using WarbirdApi.Models;
using WarbirdApi.Models.DTOs;

namespace WarbirdApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("fixed")]
public partial class AuthController : ControllerBase
{
    private readonly WarbirdDbContext _db;

    public AuthController(WarbirdDbContext db) => _db = db;

    /// <summary>Register a new user</summary>
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest req)
    {
        // Validate input
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new AuthResponse(false, "All fields are required."));

        if (req.Username.Length > 30 || !UsernameRegex().IsMatch(req.Username))
            return BadRequest(new AuthResponse(false, "Username must be 1-30 chars: letters, numbers, underscores only."));

        if (req.Email.Length > 100 || !EmailRegex().IsMatch(req.Email))
            return BadRequest(new AuthResponse(false, "Invalid email address."));

        if (req.Password.Length < 8 || req.Password.Length > 128)
            return BadRequest(new AuthResponse(false, "Password must be 8-128 characters."));

        // Check for duplicates
        var emailLower = req.Email.ToLowerInvariant();
        var usernameLower = req.Username.ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == emailLower))
            return Conflict(new AuthResponse(false, "Email already registered."));

        if (await _db.Users.AnyAsync(u => u.Username == usernameLower))
            return Conflict(new AuthResponse(false, "Username already taken."));

        // Create user
        var user = new User
        {
            Username = usernameLower,
            Email = emailLower,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(true, "Registration successful.", ToDto(user)));
    }

    /// <summary>Login with email + password</summary>
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new AuthResponse(false, "Email and password are required."));

        var emailLower = req.Email.ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == emailLower && u.IsActive);

        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new AuthResponse(false, "Invalid email or password."));

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(true, "Login successful.", ToDto(user)));
    }

    /// <summary>Connect a social account (X or Telegram)</summary>
    [HttpPost("{userId:int}/connect-social")]
    public async Task<ActionResult<AuthResponse>> ConnectSocial(int userId, [FromBody] ConnectSocialRequest req)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound(new AuthResponse(false, "User not found."));

        var handle = req.Handle?.Trim().TrimStart('@');
        if (string.IsNullOrWhiteSpace(handle) || handle.Length > 30 || !UsernameRegex().IsMatch(handle))
            return BadRequest(new AuthResponse(false, "Invalid handle."));

        switch (req.Platform?.ToLowerInvariant())
        {
            case "x":
            case "twitter":
                user.XHandle = handle;
                break;
            case "telegram":
                user.TelegramHandle = handle;
                break;
            default:
                return BadRequest(new AuthResponse(false, "Platform must be 'x' or 'telegram'."));
        }

        await _db.SaveChangesAsync();
        return Ok(new AuthResponse(true, $"Connected {req.Platform} account @{handle}.", ToDto(user)));
    }

    /// <summary>Connect wallet address</summary>
    [HttpPost("{userId:int}/connect-wallet")]
    public async Task<ActionResult<AuthResponse>> ConnectWallet(int userId, [FromBody] ConnectWalletRequest req)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound(new AuthResponse(false, "User not found."));

        if (string.IsNullOrWhiteSpace(req.WalletAddress) || req.WalletAddress.Length > 50)
            return BadRequest(new AuthResponse(false, "Invalid wallet address."));

        // Basic Solana address validation (base58, 32-44 chars)
        if (!SolanaAddressRegex().IsMatch(req.WalletAddress))
            return BadRequest(new AuthResponse(false, "Invalid Solana wallet address format."));

        user.WalletAddress = req.WalletAddress;
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(true, "Wallet connected.", ToDto(user)));
    }

    /// <summary>Get user profile</summary>
    [HttpGet("{userId:int}")]
    public async Task<ActionResult<AuthResponse>> GetProfile(int userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound(new AuthResponse(false, "User not found."));
        return Ok(new AuthResponse(true, "OK", ToDto(user)));
    }

    private static UserDto ToDto(User u) => new(
        u.Id, u.Username, u.Email, u.XHandle, u.TelegramHandle, u.WalletAddress, u.CreatedAt
    );

    [GeneratedRegex(@"^[a-zA-Z0-9_]{1,30}$")]
    private static partial Regex UsernameRegex();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"^[1-9A-HJ-NP-Za-km-z]{32,44}$")]
    private static partial Regex SolanaAddressRegex();
}
