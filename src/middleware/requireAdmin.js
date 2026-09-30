import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
export async function requireAdmin(req,res,next){
 try { const token=req.cookies?.petcard_admin; if(!token)return res.status(401).json({message:"Please log in."}); const payload=jwt.verify(token,process.env.JWT_SECRET); const admin=await Admin.findById(payload.sub).select("_id name email verified"); if(!admin||!admin.verified)return res.status(401).json({message:"Unauthorized."}); req.admin=admin; next(); }
 catch{return res.status(401).json({message:"Session expired. Please log in again."});}
}
