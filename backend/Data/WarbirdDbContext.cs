using Microsoft.EntityFrameworkCore;
using WarbirdApi.Models;

namespace WarbirdApi.Data;

public class WarbirdDbContext : DbContext
{
    public WarbirdDbContext(DbContextOptions<WarbirdDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<Subscriber> Subscribers => Set<Subscriber>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.HasIndex(u => u.Username).IsUnique();
        });

        modelBuilder.Entity<Subscriber>(e =>
        {
            e.HasIndex(s => s.Email).IsUnique();
        });
    }
}
