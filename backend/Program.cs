using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using WarbirdApi.Data;

var builder = WebApplication.CreateBuilder(args);

// ═══ DATABASE ═══
builder.Services.AddDbContext<WarbirdDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=warbird.db"));

// ═══ CONTROLLERS ═══
builder.Services.AddControllers();

// ═══ CORS — allow the GitHub Pages frontend ═══
builder.Services.AddCors(opts =>
{
    opts.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "https://muthamim.github.io",
                "http://localhost:5500",     // live-server dev
                "http://127.0.0.1:5500"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetPreflightMaxAge(TimeSpan.FromHours(1));
    });
});

// ═══ RATE LIMITING ═══
builder.Services.AddRateLimiter(opts =>
{
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opts.AddPolicy("fixed", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 5
            }));
});

// ═══ OPENAPI / SWAGGER ═══
builder.Services.AddOpenApi();

var app = builder.Build();

// ═══ AUTO-MIGRATE DATABASE ═══
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<WarbirdDbContext>();
    db.Database.EnsureCreated();
}

// ═══ SECURITY MIDDLEWARE ═══
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    ctx.Response.Headers["Pragma"] = "no-cache";
    await next();
});

// ═══ PIPELINE ═══
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.MapControllers();

// ═══ ROOT WELCOME ═══
app.MapGet("/", () => Results.Json(new
{
    name = "WARBIRD API",
    version = "1.0.0",
    endpoints = new
    {
        health = "GET /api/health",
        register = "POST /api/auth/register",
        login = "POST /api/auth/login",
        profile = "GET /api/auth/{userId}",
        connectSocial = "POST /api/auth/{userId}/connect-social",
        connectWallet = "POST /api/auth/{userId}/connect-wallet",
        contact = "POST /api/community/contact",
        subscribe = "POST /api/community/subscribe",
        unsubscribe = "DELETE /api/community/unsubscribe",
        stats = "GET /api/community/stats"
    }
}));

app.Run();
