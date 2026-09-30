import mongoose from "mongoose";
const schema=new mongoose.Schema({name:{type:String,required:true,trim:true},email:{type:String,required:true,unique:true,lowercase:true,trim:true},passwordHash:{type:String,required:true},verified:{type:Boolean,default:false},otpHash:String,otpExpires:Date,resetHash:String,resetExpires:Date},{timestamps:true});
export default mongoose.model("Admin",schema);
