namespace WarbirdApi.Models.DTOs;

public record RegisterRequest(string Username, string Email, string Password);
public record LoginRequest(string Email, string Password);
public record ConnectSocialRequest(string Platform, string Handle);
public record ConnectWalletRequest(string WalletAddress);
public record ContactRequest(string Name, string Email, string Message);
public record SubscribeRequest(string Email);

public record AuthResponse(bool Success, string Message, UserDto? User = null);
public record UserDto(int Id, string Username, string Email, string? XHandle, string? TelegramHandle, string? WalletAddress, DateTime CreatedAt);
public record ApiResponse(bool Success, string Message);
public record StatsResponse(int TotalUsers, int TotalSubscribers, DateTime ServerTime);
