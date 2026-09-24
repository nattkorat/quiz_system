# Docker Compose on port 9090 + Cloudflare Tunnel

The complete QuizForge app runs on your server. Docker Compose serves the frontend, REST API, and WebSockets through one local address. Cloudflare Tunnel publishes that address on your domain without opening an inbound router port.

```text
https://quiz.yourdomain.com
        ↓
Cloudflare Tunnel
        ↓
http://127.0.0.1:9090
        ↓
Nginx frontend → FastAPI backend → PostgreSQL
```

## 1. Configure the server

Install Docker, Docker Compose, Git, and `cloudflared`, then clone the repository:

```bash
git clone https://github.com/nattkorat/quiz_system.git
cd quiz_system
cp .env.example .env
```

Edit `.env` and replace every placeholder. For production, use:

```text
CORS_ORIGINS=https://quiz.yourdomain.com
CORS_ORIGIN_REGEX=
ALLOW_PUBLIC_REGISTRATION=false
APP_PORT=9090
VITE_API_URL=/api
VITE_WS_URL=
VITE_ALLOW_REGISTRATION=false
PASSWORD_RESET_ENABLED=true
PASSWORD_RESET_BASE_URL=https://quiz.yourdomain.com
PASSWORD_RESET_EXPIRE_MINUTES=30
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
MAIL_FROM="QuizForge <no-reply@yourdomain.com>"
```

Generate safe hexadecimal secrets:

```bash
openssl rand -hex 32
openssl rand -hex 24
```

Use the first value for `JWT_SECRET` and the second for `POSTGRES_PASSWORD`. Keep `.env` private; it is ignored by Git.

Password recovery sends a short-lived link through your SMTP provider. If email is not ready yet, set `PASSWORD_RESET_ENABLED=false`; the login page will tell instructors to contact the administrator instead.

## 2. Run the complete app

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:9090/api/health
```

Port 9090 is bound only to `127.0.0.1`. PostgreSQL and the backend container are not directly exposed. Change `APP_PORT` if you later need another host port.

## 3. Connect your Cloudflare domain

In the Cloudflare dashboard, select your Tunnel and add a published application route:

- Hostname: `quiz.yourdomain.com`
- Service type: `HTTP`
- Service URL: `http://127.0.0.1:9090`

Install the connector as a system service using the command and token displayed by Cloudflare. Keep the token private.

For a locally managed tunnel, use the equivalent configuration:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_UUID.json
ingress:
  - hostname: quiz.yourdomain.com
    service: http://127.0.0.1:9090
  - service: http_status:404
```

Then create the DNS route and run the tunnel:

```bash
cloudflared tunnel route dns YOUR_TUNNEL_UUID quiz.yourdomain.com
cloudflared tunnel run YOUR_TUNNEL_UUID
```

Cloudflare Tunnel supports WebSockets. The included Nginx configuration keeps live quiz connections open for up to one hour of inactivity.

Do not add a Cloudflare Access login to the public quiz hostname because students must reach it directly. The app still requires instructor authentication. Cloudflare WAF and rate-limiting rules can be added without forcing student login.

## 4. Verify the deployment

```bash
curl https://quiz.yourdomain.com/api/health
```

Then:

1. Open `https://quiz.yourdomain.com` and choose **Join quiz**.
2. Sign in as an instructor in another browser window.
3. Start a quiz and join with its PIN.
4. Confirm player counts, answers, per-question results, and automatic advancement.
5. Export the completed session.

Useful commands:

```bash
docker compose ps
docker compose logs -f backend frontend
docker compose up -d --build
cloudflared tunnel info YOUR_TUNNEL_UUID
```

## Security and maintenance

- The Cloudflare hostname is public, so anyone can reach the landing and join pages.
- Keep public instructor registration disabled except while onboarding instructors.
- Add a Cloudflare rate-limiting rule for `/api/auth/forgot-password` to prevent email abuse.
- Use unique passwords and rotate `JWT_SECRET` if exposed.
- Back up the `quizforge_data` Docker volume before server maintenance.
- The server, Docker stack, and `cloudflared` service must stay running.
