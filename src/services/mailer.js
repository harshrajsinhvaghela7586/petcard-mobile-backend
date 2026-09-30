import nodemailer from "nodemailer";
const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE!=="false",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
export async function sendCode(to,code,subject="PetCard verification code"){
 return transporter.sendMail({from:process.env.MAIL_FROM,to,subject, text:`Your PetCard code is ${code}. It expires in ${process.env.OTP_EXPIRES_MINUTES||10} minutes. Do not share it.` ,html:`<div style="font-family:Arial,sans-serif;color:#382018"><h2>PetCard</h2><p>Your verification code:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#ff7a00">${code}</div><p>This code expires soon. Do not share it.</p></div>`});
}
