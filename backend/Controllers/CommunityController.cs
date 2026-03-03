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
public class CommunityController : ControllerBase
{
    private readonly WarbirdDbContext _db;

    public CommunityController(WarbirdDbContext db) => _db = db;

    /// <summary>Submit a contact message</summary>
    [HttpPost("contact")]
    public async Task<ActionResult<ApiResponse>> Contact([FromBody] ContactRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 100)
            return BadRequest(new ApiResponse(false, "Name is required (max 100 chars)."));

        if (string.IsNullOrWhiteSpace(req.Email) || req.Email.Length > 100)
            return BadRequest(new ApiResponse(false, "Valid email is required (max 100 chars)."));

        if (string.IsNullOrWhiteSpace(req.Message) || req.Message.Length > 2000)
            return BadRequest(new ApiResponse(false, "Message is required (max 2000 chars)."));

        var msg = new ContactMessage
        {
            Name = req.Name.Trim(),
            Email = req.Email.Trim().ToLowerInvariant(),
            Message = req.Message.Trim(),
            SentAt = DateTime.UtcNow
        };

        _db.ContactMessages.Add(msg);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse(true, "Message sent successfully. We'll get back to you!"));
    }

    /// <summary>Subscribe to newsletter/updates</summary>
    [HttpPost("subscribe")]
    public async Task<ActionResult<ApiResponse>> Subscribe([FromBody] SubscribeRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || req.Email.Length > 100)
            return BadRequest(new ApiResponse(false, "Valid email is required."));

        var emailLower = req.Email.Trim().ToLowerInvariant();

        if (await _db.Subscribers.AnyAsync(s => s.Email == emailLower))
            return Ok(new ApiResponse(true, "You're already subscribed!"));

        _db.Subscribers.Add(new Subscriber { Email = emailLower, SubscribedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse(true, "Subscribed successfully! Welcome to the WARBIRD community."));
    }

    /// <summary>Unsubscribe from updates</summary>
    [HttpDelete("unsubscribe")]
    public async Task<ActionResult<ApiResponse>> Unsubscribe([FromQuery] string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new ApiResponse(false, "Email is required."));

        var sub = await _db.Subscribers.FirstOrDefaultAsync(s => s.Email == email.Trim().ToLowerInvariant());
        if (sub == null)
            return NotFound(new ApiResponse(false, "Email not found."));

        sub.IsActive = false;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse(true, "Unsubscribed successfully."));
    }

    /// <summary>Public stats endpoint</summary>
    [HttpGet("stats")]
    public async Task<ActionResult<StatsResponse>> Stats()
    {
        var users = await _db.Users.CountAsync(u => u.IsActive);
        var subs = await _db.Subscribers.CountAsync(s => s.IsActive);
        return Ok(new StatsResponse(users, subs, DateTime.UtcNow));
    }
}
