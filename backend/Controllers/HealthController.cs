using Microsoft.AspNetCore.Mvc;

namespace WarbirdApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    /// <summary>Health check endpoint</summary>
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "healthy",
        service = "WarbirdApi",
        version = "1.0.0",
        timestamp = DateTime.UtcNow
    });
}
