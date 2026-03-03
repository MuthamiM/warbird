using System.ComponentModel.DataAnnotations;

namespace WarbirdApi.Models;

public class Subscriber
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string Email { get; set; } = string.Empty;

    public DateTime SubscribedAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; } = true;
}
