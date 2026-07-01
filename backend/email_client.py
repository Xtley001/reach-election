def _otp_html(otp: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your REACH code</title>
  <style>
    body {{ margin: 0; padding: 0; background: #F5F5F7; font-family: -apple-system, 'Plus Jakarta Sans', sans-serif; }}
    .container {{ max-width: 480px; margin: 40px auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .header {{ background: #1D1D1F; padding: 32px 40px; text-align: center; }}
    .header h1 {{ margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }}
    .body {{ padding: 40px; }}
    .body p {{ margin: 0 0 16px; color: #6E6E73; font-size: 15px; line-height: 1.6; }}
    .otp-box {{ background: #F5F5F7; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 40px; font-weight: 800; letter-spacing: 0.15em; color: #1D1D1F; font-family: 'SF Mono', 'Fira Code', monospace; }}
    .footer {{ padding: 24px 40px; border-top: 1px solid #E8E8ED; }}
    .footer p {{ margin: 0; color: #86868B; font-size: 12px; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>REACH Election</h1>
    </div>
    <div class="body">
      <p>Here is your verification code to sign in to REACH Election:</p>
      <div class="otp-box">
        <div class="otp-code">{otp}</div>
      </div>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p>If you didn't request this code, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>REACH Election — Voter mobilisation infrastructure.<br />This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
"""


def _agent_invite_html(invited_name: str, coordinator_name: str,
                        campaign_name: str, zone_name: str,
                        invite_url: str) -> str:
    import html
    invited_name     = html.escape(invited_name or "")
    coordinator_name = html.escape(coordinator_name or "")
    campaign_name    = html.escape(campaign_name or "")
    zone_name        = html.escape(zone_name or "")
    invite_url       = html.escape(invite_url or "", quote=True)
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {{ margin: 0; padding: 0; background: #F5F5F7; font-family: -apple-system, 'Plus Jakarta Sans', sans-serif; }}
    .container {{ max-width: 480px; margin: 40px auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .header {{ background: #1D1D1F; padding: 32px 40px; text-align: center; }}
    .header h1 {{ margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 700; }}
    .body {{ padding: 40px; }}
    .body p {{ margin: 0 0 16px; color: #6E6E73; font-size: 15px; line-height: 1.6; }}
    .body strong {{ color: #1D1D1F; }}
    .cta {{ display: block; background: #1D1D1F; color: #FFFFFF; text-align: center; padding: 16px 24px; border-radius: 10px; font-weight: 700; font-size: 16px; text-decoration: none; margin: 24px 0; }}
    .note {{ background: #F5F5F7; border-radius: 10px; padding: 16px; }}
    .note p {{ margin: 0; font-size: 13px; color: #86868B; }}
    .footer {{ padding: 24px 40px; border-top: 1px solid #E8E8ED; }}
    .footer p {{ margin: 0; color: #86868B; font-size: 12px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>REACH Election</h1>
    </div>
    <div class="body">
      <p>Hi <strong>{invited_name}</strong>,</p>
      <p><strong>{coordinator_name}</strong> has invited you to join <strong>{campaign_name}</strong> as a field agent in the <strong>{zone_name}</strong> zone.</p>
      <p>Click the button below to accept your invite and get started:</p>
      <a href="{invite_url}" class="cta">Accept Invite →</a>
      <div class="note">
        <p>This invite link expires in 7 days and can only be used once. If you have questions, contact {coordinator_name} directly.</p>
      </div>
    </div>
    <div class="footer">
      <p>REACH Election — Voter mobilisation infrastructure.</p>
    </div>
  </div>
</body>
</html>
"""
