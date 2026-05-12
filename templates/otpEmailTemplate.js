const buildOtpEmailTemplate = ({ fullname, otpCode }) => {
    const safeName = fullname || "DigiEduSystem learner";

    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DigiEduSystem Verification Code</title>
  </head>
  <body style="margin:0;padding:0;background:#fff8f1;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:680px;margin:0 auto;padding:36px 16px;">
      <div style="border-radius:32px;overflow:hidden;background:#ffffff;border:1px solid rgba(251,146,60,0.18);box-shadow:0 24px 80px rgba(249,115,22,0.14);">
        <div style="padding:36px 36px 28px;background:linear-gradient(140deg,#f97316 0%,#fb923c 48%,#fdba74 100%);color:#fffaf5;">
          <div style="display:inline-flex;align-items:center;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,0.16);font-size:12px;letter-spacing:0.18em;text-transform:uppercase;">
            DigiEduSystem
          </div>
          <h1 style="margin:18px 0 12px;font-size:34px;line-height:1.1;">Verify your email address</h1>
          <p style="margin:0;max-width:460px;font-size:15px;line-height:1.8;color:rgba(255,250,245,0.92);">
            Your new learning account is almost ready. Enter the secure one-time code below to activate DigiEduSystem.
          </p>
        </div>

        <div style="padding:34px 36px 36px;background:linear-gradient(180deg,#ffffff 0%,#fffaf5 100%);">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hello ${safeName},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#4b5563;">
            Use this 6-digit verification code to finish signing in to DigiEduSystem.
            It will expire in <strong>5 minutes</strong>.
          </p>

          <div style="margin:0 0 24px;padding:26px 22px;border-radius:26px;background:linear-gradient(135deg,#fff7ed 0%,#fffbf5 100%);border:1px dashed #fb923c;text-align:center;">
            <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#9a3412;margin-bottom:12px;">
              Verification Code
            </div>
            <div style="font-size:38px;font-weight:700;letter-spacing:0.55em;color:#c2410c;padding-left:0.55em;">
              ${otpCode}
            </div>
          </div>

          <div style="display:grid;gap:14px;">
            <div style="padding:18px 20px;border-radius:20px;background:#fff7ed;border:1px solid rgba(251,146,60,0.22);">
              <div style="font-size:13px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">
                Security note
              </div>
              <div style="font-size:14px;line-height:1.8;color:#7c2d12;">
                Never share this code with anyone. DigiEduSystem support will never ask for your verification code.
              </div>
            </div>

            <div style="font-size:13px;line-height:1.8;color:#6b7280;">
              If you did not request this email, you can safely ignore it and no changes will be made to your account.
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`;
};

module.exports = {
    buildOtpEmailTemplate
};
