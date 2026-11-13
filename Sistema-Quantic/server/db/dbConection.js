import mongoose from 'mongoose';

// MongoDB connection URI mongodb://192.168.18.32:27017/inventario
//This is fun
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/inventario";

const connectDB = async () => {
  try {
    await mongoose.connect(uri);
    console.log("Successfully connected to MongoDB and 'inventario' database!");
  } catch (error) {
    console.error("No se pudo conectar con MongoDB:", error.name);
    process.exit(1);
  }
};

export default connectDB;
