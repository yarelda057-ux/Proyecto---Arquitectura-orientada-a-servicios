import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  { 
    email: {
      type: String,
      required: true,
      unique: true, // Asegura que el correo electrónico sea único
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 15,
      select: false, // Longitud mínima para la contraseña
    },
    // Puedes añadir otros campos como 'role', 'isActive', etc.
    isActive: { type: Boolean, default: true },
    role: {
      type: String,
      enum: ['user', 'admin', 'mayorista'],
      default: 'user',
    },
    // Solo los usuarios mayoristas quedan ligados a un proveedor concreto.
    // Se guarda el ID público (MAY-xxxxxx), no un ObjectId interno.
    supplierId: {
      type: String,
      trim: true,
      uppercase: true,
      required() { return this.role === 'mayorista'; },
      index: true,
    },
  },
  {
    timestamps: true, // Agrega automáticamente los campos 'createdAt' y 'updatedAt'
  }
);

// Middleware para encriptar la contraseña antes de guardar el usuario
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  if (Buffer.byteLength(this.password) > 72) throw new Error('Password exceeds bcrypt limit');
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar la contraseña ingresada con la encriptada
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = model('User', userSchema);

export default User;
