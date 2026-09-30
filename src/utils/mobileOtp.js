import crypto from "node:crypto";
import nodemailer from "nodemailer";

export const makeOtp = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export const hashOtp = (otp) =>
  crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");

export const matchesOtp = (otp, hash) => {
  if (!hash || !/^\d{6}$/.test(String(otp))) {
    return false;
  }

  const otpHash = hashOtp(otp);
  const a = Buffer.from(otpHash, "hex");
  const b = Buffer.from(hash, "hex");

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
};

export const sendOtpEmail = async ({
  to,
  otp,
  purpose = "verify your email",
}) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure:
      String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const isReset = purpose === "reset";
  const expiryMinutes = Number(
    process.env.MOBILE_OTP_MINUTES || 10
  );

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,

    subject: isReset
      ? "PetCard password reset code"
      : "Verify your PetCard email",

    text: `Your PetCard code is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this, ignore this email.`,

    html: `
      <div style="font-family:Arial,sans-serif;color:#382018">
        <h2>PetCard</h2>
        <p>
          ${
            isReset
              ? "Use this code to reset your password:"
              : "Your verification code:"
          }
        </p>

        <div style="
          font-size:30px;
          letter-spacing:8px;
          font-weight:bold;
          color:#FF7A00;
        ">
          ${otp}
        </div>

        <p>
          This code expires in ${expiryMinutes} minutes.
        </p>

        <p>
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  });
};