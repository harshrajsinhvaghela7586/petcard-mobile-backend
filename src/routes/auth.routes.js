import {Router} from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import {sendCode} from "../services/mailer.js";
import {requireAdmin} from "../middleware/requireAdmin.js";
export const authRouter=Router();
const limiter=rateLimit({windowMs:15*60*1000,limit:25,standardHeaders:true,legacyHeaders:false});
authRouter.use(limiter);
const hash=v=>crypto.createHash("sha256").update(v).digest("hex");
const makeCode=()=>String(crypto.randomInt(0,1000000)).padStart(6,"0");
const expiry=()=>new Date(Date.now()+Number(process.env.OTP_EXPIRES_MINUTES||10)*60000);
const cookieOptions={httpOnly:true,secure:process.env.COOKIE_SECURE==="true",sameSite:"lax",path:"/",maxAge:7*24*60*60*1000};
const issue=(res,admin)=>{const token=jwt.sign({sub:admin._id.toString()},process.env.JWT_SECRET,{expiresIn:"7d"});res.cookie("petcard_admin",token,cookieOptions);};
authRouter.get("/setup-status",async(_,res)=>{res.json({needsSetup:(await Admin.countDocuments())===0});});
authRouter.post("/signup",async(req,res)=>{
 try{
 const {name,email,password}=req.body; if(!name?.trim()||!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<8)return res.status(400).json({message:"Enter name, valid email and password (8+ characters)."});
 if(await Admin.countDocuments())return res.status(403).json({message:"Admin signup is closed. Ask an existing administrator."});
 if(await Admin.findOne({email:email.toLowerCase()}))return res.status(409).json({message:"Email already registered."});
 const code=makeCode(); const admin=await Admin.create({name,email,passwordHash:await bcrypt.hash(password,12),otpHash:hash(code),otpExpires:expiry()});
 try{await sendCode(admin.email,code);}catch(e){await Admin.deleteOne({_id:admin._id});throw e;}
 res.status(201).json({message:"Verification code sent to your email.",email:admin.email});
 }catch(e){res.status(500).json({message:"Could not create account or send email. Check SMTP configuration."});}
});
authRouter.post("/verify-otp",async(req,res)=>{
 const {email,otp}=req.body; const admin=await Admin.findOne({email:email?.toLowerCase()});
 if(!admin||!admin.otpHash||admin.otpExpires<Date.now()||admin.otpHash!==hash(String(otp||"")))return res.status(400).json({message:"Invalid or expired code."});
 admin.verified=true;admin.otpHash=undefined;admin.otpExpires=undefined;await admin.save();issue(res,admin);res.json({message:"Email verified.",admin:{name:admin.name,email:admin.email}});
});
authRouter.post("/resend-otp",async(req,res)=>{
 const admin=await Admin.findOne({email:req.body.email?.toLowerCase()});if(!admin||admin.verified)return res.json({message:"If the account needs verification, a code has been sent."});
 const code=makeCode();admin.otpHash=hash(code);admin.otpExpires=expiry();await admin.save();await sendCode(admin.email,code);res.json({message:"A new code has been sent."});
});
authRouter.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const admin = await Admin.findOne({ email });

    if (
      !admin ||
      !(await bcrypt.compare(password, admin.passwordHash))
    ) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (!admin.verified) {
      return res.status(403).json({
        message: "Please verify your email first.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Authentication is not configured.",
      });
    }

    issue(res, admin);

    return res.json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      message: "Unable to log in. Please try again.",
    });
  }
});


authRouter.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    const admin = await Admin.findOne({ email });

    // Same response whether the account exists or not.
    if (admin && admin.verified) {
      const code = makeCode();

      admin.resetHash = hash(code);
      admin.resetExpires = expiry();

      await admin.save();

      await sendCode(
        admin.email,
        code,
        "PetCard password reset code"
      );
    }

    return res.json({
      success: true,
      message:
        "If the email is registered and verified, a reset code has been sent.",
    });
  } catch (error) {
    console.error("Admin forgot-password error:", error);

    return res.status(500).json({
      message: "Could not send reset code. Check email configuration.",
    });
  }
});

authRouter.post("/reset-password",async(req,res)=>{
 const {email,otp,password}=req.body;const admin=await Admin.findOne({email:email?.toLowerCase()});
 if(!admin||!admin.resetHash||admin.resetExpires<Date.now()||admin.resetHash!==hash(String(otp||"")))return res.status(400).json({message:"Invalid or expired code."});
 if(!password||password.length<8)return res.status(400).json({message:"Password must be at least 8 characters."});
 admin.passwordHash=await bcrypt.hash(password,12);admin.resetHash=undefined;admin.resetExpires=undefined;await admin.save();res.json({message:"Password updated. Please log in."});
});
authRouter.get("/me",requireAdmin,(req,res)=>res.json({admin:req.admin}));
authRouter.post("/logout",(_,res)=>{res.clearCookie("petcard_admin",{...cookieOptions,maxAge:undefined});res.json({message:"Logged out."});});
