import smtplib
from email.message import EmailMessage

from .config import MAIL_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURITY, SMTP_USERNAME


def send_password_reset_email(recipient: str, reset_url: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Reset your QuizForge password"
    message["From"] = MAIL_FROM
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your QuizForge instructor account.\n\n"
        f"Open this link to choose a new password:\n{reset_url}\n\n"
        "The link expires soon and stops working after your password changes. "
        "If you did not request this, you can ignore this email."
    )

    if SMTP_SECURITY == "ssl":
        client = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
    else:
        client = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)

    with client:
        if SMTP_SECURITY == "starttls":
            client.starttls()
        if SMTP_USERNAME:
            client.login(SMTP_USERNAME, SMTP_PASSWORD)
        client.send_message(message)
