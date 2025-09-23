# Docker Deployment Guide for WhatsApp QR Scanner

This guide will help you deploy your WhatsApp QR Scanner application to a server using Docker.

## Prerequisites

- Docker installed on your server
- Docker Compose installed on your server
- A server with at least 1GB RAM and 1 CPU core
- Domain name (optional, for production)

## Quick Start

### 1. Prepare Your Server

```bash
# Update your server
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add your user to docker group (optional)
sudo usermod -aG docker $USER
```

### 2. Upload Your Application

Upload your application files to the server:

```bash
# Using SCP (replace with your server details)
scp -r . user@your-server-ip:/home/user/whatsapp-qr

# Or using Git
git clone <your-repository-url>
cd whatsapp-qr
```

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp env.example .env

# Edit the environment file
nano .env
```

Update the following variables in `.env`:

```env
# For production, change these values:
BASE_URL=https://yourdomain.com
MASTER_KEY=your_very_secure_master_key_here
CORS_ORIGIN=https://yourdomain.com
```

### 4. Deploy with Docker Compose

```bash
# Build and start the application
docker-compose up -d

# Check if the container is running
docker-compose ps

# View logs
docker-compose logs -f
```

### 5. Access Your Application

- Open your browser and go to `http://your-server-ip:3000`
- Or if you have a domain: `https://yourdomain.com`

## Production Deployment with Nginx (Recommended)

### 1. Install Nginx

```bash
sudo apt install nginx -y
```

### 2. Configure Nginx

Create a new configuration file:

```bash
sudo nano /etc/nginx/sites-available/whatsapp-qr
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Enable the Site

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/whatsapp-qr /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 4. Install SSL Certificate (Optional but Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Docker Commands Reference

### Basic Commands

```bash
# Start the application
docker-compose up -d

# Stop the application
docker-compose down

# Restart the application
docker-compose restart

# View logs
docker-compose logs -f

# Update the application
docker-compose pull
docker-compose up -d
```

### Maintenance Commands

```bash
# View container status
docker-compose ps

# Access container shell
docker-compose exec whatsapp-qr sh

# View resource usage
docker stats

# Clean up unused images
docker system prune -a
```

### Backup and Restore

```bash
# Backup WhatsApp session data
docker run --rm -v whatsapp-qr_whatsapp_session:/data -v $(pwd):/backup alpine tar czf /backup/whatsapp-session-backup.tar.gz -C /data .

# Restore WhatsApp session data
docker run --rm -v whatsapp-qr_whatsapp_session:/data -v $(pwd):/backup alpine tar xzf /backup/whatsapp-session-backup.tar.gz -C /data
```

## Environment Variables Explained

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `BASE_URL` | Base URL for the application | http://localhost:3000 | Yes (for production) |
| `MASTER_KEY` | Master key for API key generation | change_this_secure_key | Yes (change in production) |
| `CORS_ORIGIN` | CORS origin | * | Yes (for production) |
| `WHATSAPP_CLIENT_ID` | WhatsApp client ID | whatsapp-qr-scanner | No |

## Security Considerations

### 1. Change Default Values

- **Always change the `MASTER_KEY`** in production
- Set a specific `CORS_ORIGIN` instead of using `*`
- Use HTTPS in production

### 2. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 3. Regular Updates

```bash
# Update Docker images regularly
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   # Check logs
   docker-compose logs
   
   # Check if port is already in use
   sudo netstat -tlnp | grep :3000
   ```

2. **QR Code not appearing**
   ```bash
   # Check if WhatsApp session data exists
   docker-compose exec whatsapp-qr ls -la .wwebjs_auth
   
   # Clear session data if needed
   docker-compose down
   docker volume rm whatsapp-qr_whatsapp_session
   docker-compose up -d
   ```

3. **Memory issues**
   ```bash
   # Check memory usage
   docker stats
   
   # Increase memory limits in docker-compose.yml
   ```

4. **Permission issues**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER .
   ```

### Logs and Monitoring

```bash
# View real-time logs
docker-compose logs -f whatsapp-qr

# View last 100 lines
docker-compose logs --tail=100 whatsapp-qr

# Check container health
docker-compose ps
```

## Performance Optimization

### 1. Resource Limits

The `docker-compose.yml` includes resource limits. Adjust them based on your server:

```yaml
deploy:
  resources:
    limits:
      memory: 1G      # Increase if needed
      cpus: '0.5'     # Increase if needed
```

### 2. Monitoring

```bash
# Install monitoring tools
sudo apt install htop iotop -y

# Monitor resource usage
htop
```

## Backup Strategy

### 1. Automated Backup Script

Create a backup script:

```bash
nano backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/whatsapp-qr"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup session data
docker run --rm -v whatsapp-qr_whatsapp_session:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/session_$DATE.tar.gz -C /data .

# Backup API keys
cp api-keys.json $BACKUP_DIR/api-keys_$DATE.json

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "api-keys_*.json" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Make executable
chmod +x backup.sh

# Add to crontab for daily backups
crontab -e
# Add this line:
# 0 2 * * * /path/to/backup.sh
```

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables
3. Check server resources
4. Ensure all ports are accessible

For additional help, refer to the main README.md file.
