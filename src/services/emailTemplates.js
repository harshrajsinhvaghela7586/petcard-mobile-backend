const BRAND = {
  orange: "#FF7A00",
  dark: "#382018",
  cream: "#FFF7EE",
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout({ title, intro, code, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:${BRAND.cream};font-family:Arial,Helvetica,sans-serif;color:${BRAND.dark};">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
      <h2 style="margin:0 0 12px;color:${BRAND.orange};">PetCard</h2>
      <h3 style="margin:0 0 8px;">${escapeHtml(title)}</h3>
      <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(intro)}</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:${BRAND.orange};margin:0 0 16px;">${escapeHtml(code)}</div>
      <p style="margin:0 0 8px;line-height:1.5;">${escapeHtml(footer)}</p>
      <p style="margin:0;font-size:12px;color:#8a7a72;">If you did not request this, you can safely ignore this email. Never share this code with anyone.</p>
    </div>
  </body>
</html>`;
}

/** @param {{ otp: string, purpose: "verify" | "reset", minutes: number }} input */
export function otpEmail({ otp, purpose, minutes }) {
  const isReset = purpose === "reset";

  const subject = isReset ? "PetCard password reset code" : "Verify your PetCard email";
  const title = isReset ? "Reset your password" : "Verify your email";
  const intro = isReset
    ? "Use this code to reset your PetCard password:"
    : "Use this code to finish creating your PetCard account:";
  const footer = `This code expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

  const text = [
    "PetCard",
    "",
    intro,
    "",
    `  ${otp}`,
    "",
    footer,
    "If you did not request this, ignore this email. Never share this code.",
  ].join("\n");

  return { subject, text, html: layout({ title, intro, code: otp, footer }) };
}

/** Generic notification email (guardian requests etc.). */
export function notificationEmail({ name, title, body }) {
  const subject = `PetCard: ${title}`;
  const text = [`Hi ${name || "there"},`, "", title, body, "", "Open the PetCard app to respond."]
    .filter((line) => line !== undefined)
    .join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:${BRAND.cream};font-family:Arial,Helvetica,sans-serif;color:${BRAND.dark};">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
      <h2 style="margin:0 0 12px;color:${BRAND.orange};">PetCard</h2>
      <h3 style="margin:0 0 8px;">${escapeHtml(title)}</h3>
      <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(body)}</p>
      <p style="margin:0;font-size:12px;color:#8a7a72;">Open the PetCard app to respond. You can turn off emails in your profile settings.</p>
    </div>
  </body>
</html>`;
  return { subject, text, html };
}
