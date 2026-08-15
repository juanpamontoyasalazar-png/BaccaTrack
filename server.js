
const express=require("express"), path=require("path"), crypto=require("crypto"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), Database=require("better-sqlite3"), {Resend}=require("resend");
const app=express(), PORT=process.env.PORT||3000, SECRET=process.env.JWT_SECRET;if(!SECRET)throw new Error("JWT_SECRET no configurado");
const engine=require("./motor_baccatrack_engine");
const RESEND_API_KEY=process.env.RESEND_API_KEY||"";
const RESEND_FROM=process.env.RESEND_FROM||"";
const APP_URL=(process.env.APP_URL||"https://baccatrack.onrender.com").replace(/\/+$/,"");
const resend=RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const db=new Database(process.env.DB_PATH||"baccatrack.db");
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',license_expires TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,active INTEGER NOT NULL DEFAULT 1,last_login TEXT,last_activity TEXT);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,started_at TEXT DEFAULT CURRENT_TIMESTAMP,capital REAL DEFAULT 0,profit REAL DEFAULT 0,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS password_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));`);
try {
  db.prepare("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
  console.log("Columna active agregada a users.");
} catch(e) {
  if (!String(e.message||"").toLowerCase().includes("duplicate column")) throw e;
}
try {
  db.prepare("ALTER TABLE users ADD COLUMN last_login TEXT").run();
} catch(e) {
  if(!String(e.message||"").toLowerCase().includes("duplicate column")) throw e;
}
try {
  db.prepare("ALTER TABLE users ADD COLUMN last_activity TEXT").run();
} catch(e) {
  if(!String(e.message||"").toLowerCase().includes("duplicate column")) throw e;
}
let admin=db.prepare("SELECT * FROM users WHERE role='admin'").get();
if(!admin){
 const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD||"CAMBIAR_ADMIN_PASSWORD",10);
 db.prepare("INSERT INTO users(email,password,role,license_expires) VALUES(?,?,?,datetime('now','+365 days'))").run(process.env.ADMIN_EMAIL||"admin@baccatrack.app",hash,"admin");
 console.log("Admin created. Change credentials before production.");
}
app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
function auth(req,res,next){try{const h=req.headers.authorization||"";const t=h.replace("Bearer ","");req.user=jwt.verify(t,SECRET);next()}catch(e){res.status(401).json({error:"No autorizado"})}}
app.post("/api/register",(req,res)=>{
  try{
    const email=String(req.body.email||"").toLowerCase().trim();
    const password=String(req.body.password||"");

    if(!email || !email.includes("@")){
      return res.status(400).json({error:"Ingresa un correo vÃƒÂ¡lido"});
    }

    if(password.length<6){
      return res.status(400).json({error:"La contraseÃƒÂ±a debe tener mÃƒÂ­nimo 6 caracteres"});
    }

    const existe=db.prepare("SELECT id FROM users WHERE email=?").get(email);

    if(existe){
      return res.status(409).json({error:"Este correo ya estÃƒÂ¡ registrado"});
    }

    const hash=bcrypt.hashSync(password,10);

    const exp=new Date(
      Date.now()+30*86400000
    ).toISOString();

    const r=db.prepare(
      "INSERT INTO users(email,password,role,license_expires) VALUES(?,?,?,?)"
    ).run(email,hash,"user",exp);

    const token=jwt.sign(
      {id:r.lastInsertRowid,email,role:"user"},
      SECRET,
      {expiresIn:"7d"}
    );

    res.json({
      ok:true,
      token,
      user:{
        id:r.lastInsertRowid,
        email,
        role:"user",
        license_expires:exp
      }
    });

  }catch(e){
    console.error("REGISTER ERROR:",e);
    res.status(500).json({error:"No se pudo crear la cuenta"});
  }
});
app.post("/api/forgot-password",async(req,res)=>{
  try{
    const email=String(req.body.email||"").toLowerCase().trim();

    if(!email){
      return res.status(400).json({error:"Correo requerido"});
    }

    const genericMessage="Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.";

    const user=db.prepare(
      "SELECT id,email,active FROM users WHERE email=?"
    ).get(email);

    // No revelar si el correo existe.
    if(!user || user.active===0){
      return res.json({
        ok:true,
        message:genericMessage
      });
    }

    if(!resend || !RESEND_FROM){
      console.error("PASSWORD RESET: RESEND NO CONFIGURADO.");
      return res.status(503).json({
        error:"El servicio de recuperación por correo no está configurado."
      });
    }

    // Invalidar tokens anteriores.
    db.prepare(
      "UPDATE password_resets SET used=1 WHERE user_id=? AND used=0"
    ).run(user.id);

    // Token aleatorio seguro.
    const token=crypto.randomBytes(32).toString("hex");

    // Solo guardamos el hash del token.
    const tokenHash=crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Validez: 30 minutos.
    const expiresAt=new Date(
      Date.now()+30*60*1000
    ).toISOString();

    db.prepare(`
      INSERT INTO password_resets
      (user_id,token_hash,expires_at)
      VALUES(?,?,?)
    `).run(
      user.id,
      tokenHash,
      expiresAt
    );

    const resetUrl=
      `${APP_URL}/?reset=${encodeURIComponent(token)}`;

    const {data,error}=await resend.emails.send({
      from:RESEND_FROM,
      to:[user.email],
      subject:"Restablecer contraseña - BaccaTrack",
      html:`
        <div style="font-family:Arial,sans-serif;background:#080b12;padding:40px 20px;">
          <div style="max-width:560px;margin:auto;background:#111722;border:1px solid #293244;border-radius:16px;padding:32px;color:#fff;">
            <h1 style="margin-top:0;">BaccaTrack</h1>

            <h2>Restablecer contraseña</h2>

            <p style="color:#cbd5e1;line-height:1.6;">
              Recibimos una solicitud para cambiar la contraseña de tu cuenta.
            </p>

            <p style="color:#cbd5e1;line-height:1.6;">
              Haz clic en el siguiente botón para crear una nueva contraseña:
            </p>

            <p style="margin:30px 0;">
              <a
                href="${resetUrl}"
                style="display:inline-block;background:#2188ff;color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold;"
              >
                RESTABLECER CONTRASEÑA
              </a>
            </p>

            <p style="color:#94a3b8;font-size:14px;line-height:1.5;">
              Este enlace es válido durante 30 minutos y solo puede utilizarse una vez.
            </p>

            <p style="color:#64748b;font-size:12px;line-height:1.5;">
              Si tú no solicitaste este cambio, puedes ignorar este correo.
            </p>
          </div>
        </div>
      `
    });

    if(error){
      console.error("RESEND PASSWORD RESET ERROR:",error);

      // No dejamos activo un token cuyo correo no pudo enviarse.
      db.prepare(
        "UPDATE password_resets SET used=1 WHERE token_hash=?"
      ).run(tokenHash);

      return res.status(502).json({
        error:"No se pudo enviar el correo de recuperación."
      });
    }

    console.log(
      "PASSWORD RESET EMAIL ENVIADO:",
      user.email,
      data?.id||"sin-id"
    );

    return res.json({
      ok:true,
      message:genericMessage
    });

  }catch(e){
    console.error("FORGOT PASSWORD ERROR:",e);
    return res.status(500).json({
      error:"No se pudo procesar la solicitud"
    });
  }
});
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body.email||"").toLowerCase());if(!u||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Credenciales incorrectas"});if(u.active===0)return res.status(403).json({error:"Cuenta desactivada"});if(u.license_expires&&new Date(u.license_expires)<new Date())return res.status(403).json({error:"Licencia vencida"});db.prepare("UPDATE users SET last_login=CURRENT_TIMESTAMP,last_activity=CURRENT_TIMESTAMP WHERE id=?").run(u.id);const token=jwt.sign({id:u.id,email:u.email,role:u.role},SECRET,{expiresIn:"7d"});res.json({token,user:{id:u.id,email:u.email,role:u.role,license_expires:u.license_expires}})});
app.post("/api/reset-password",(req,res)=>{
  try{
    const token=String(req.body.token||"").trim();
    const password=String(req.body.password||"");

    if(!token || password.length<6){
      return res.status(400).json({
        error:"Token y contraseÃƒÂ±a vÃƒÂ¡lida requeridos"
      });
    }

    const tokenHash=crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const reset=db.prepare(`
      SELECT id,user_id,expires_at,used
      FROM password_resets
      WHERE token_hash=?
      LIMIT 1
    `).get(tokenHash);

    if(!reset){
      return res.status(400).json({
        error:"Enlace de recuperaciÃƒÂ³n invÃƒÂ¡lido o expirado"
      });
    }

    if(Number(reset.used)===1){
      return res.status(400).json({
        error:"Este enlace ya fue utilizado"
      });
    }

    if(new Date(reset.expires_at)<=new Date()){
      db.prepare(
        "UPDATE password_resets SET used=1 WHERE id=?"
      ).run(reset.id);

      return res.status(400).json({
        error:"El enlace de recuperaciÃƒÂ³n ha expirado"
      });
    }

    const hash=bcrypt.hashSync(password,10);

    const updateUser=db.prepare(
      "UPDATE users SET password=? WHERE id=?"
    );

    const markUsed=db.prepare(
      "UPDATE password_resets SET used=1 WHERE id=?"
    );

    const transaction=db.transaction(()=>{
      updateUser.run(hash,reset.user_id);
      markUsed.run(reset.id);
    });

    transaction();

    // Invalidar cualquier otro token pendiente del mismo usuario.
    db.prepare(`
      UPDATE password_resets
      SET used=1
      WHERE user_id=? AND id<>? AND used=0
    `).run(reset.user_id,reset.id);

    res.json({
      ok:true,
      message:"ContraseÃƒÂ±a restablecida correctamente."
    });

  }catch(e){
    console.error("RESET PASSWORD ERROR:",e);
    res.status(500).json({
      error:"No se pudo restablecer la contraseÃƒÂ±a"
    });
  }
});
app.get("/api/users/activity",auth,(req,res)=>{
  if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});
  const rows=db.prepare("SELECT id,email,role,active,last_login,last_activity,license_expires FROM users ORDER BY id DESC").all();
  res.json(rows);
});app.post("/api/activity",auth,(req,res)=>{
  db.prepare("UPDATE users SET last_activity=CURRENT_TIMESTAMP WHERE id=?").run(req.user.id);
  res.json({ok:true});
});app.get("/api/me",auth,(req,res)=>{res.json({user:db.prepare("SELECT id,email,role,license_expires,created_at FROM users WHERE id=?").get(req.user.id)})});
app.get("/api/users",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});res.json(db.prepare("SELECT id,email,role,license_expires,created_at,active,last_login,last_activity FROM users ORDER BY id DESC").all())});
app.post("/api/users",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});try{const email=String(req.body.email||"").toLowerCase().trim(),pass=String(req.body.password||"");if(!email||pass.length<6)return res.status(400).json({error:"Email y contraseÃƒÂ±a vÃƒÂ¡lidos requeridos"});const days=Math.max(1,Number(req.body.days||30));const exp=new Date(Date.now()+days*86400000).toISOString();const hash=bcrypt.hashSync(pass,10);const r=db.prepare("INSERT INTO users(email,password,role,license_expires) VALUES(?,?,?,?)").run(email,hash,"user",exp);res.json({id:r.lastInsertRowid,email,license_expires:exp})}catch(e){res.status(400).json({error:"El usuario ya existe o los datos son invÃƒÂ¡lidos"})}});
app.patch("/api/users/:id/status",auth,(req,res)=>{
  if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});
  const active=Number(req.body.active)?1:0;
  const user=db.prepare("SELECT id,role FROM users WHERE id=?").get(req.params.id);
  if(!user)return res.status(404).json({error:"Usuario no encontrado"});
  if(user.role==="admin")return res.status(400).json({error:"No puedes desactivar un administrador"});
  db.prepare("UPDATE users SET active=? WHERE id=?").run(active,req.params.id);
  res.json({ok:true,active});
});app.patch("/api/users/:id/license",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});const days=Math.max(1,Number(req.body.days||30));const exp=new Date(Date.now()+days*86400000).toISOString();db.prepare("UPDATE users SET license_expires=? WHERE id=?").run(exp,req.params.id);res.json({license_expires:exp})});
app.delete("/api/users/:id",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(req.params.id);res.json({ok:true})});
app.post("/api/analyze",auth,(req,res)=>{
  try{
    const sequence=Array.isArray(req.body.sequence)
      ? req.body.sequence.filter(x=>x==="B"||x==="J")
      : [];

    if(sequence.length<4){
      return res.status(400).json({
        error:"Se requieren al menos 4 rondas vÃƒÂ¡lidas."
      });
    }

    const result=engine.analyzeSequence(sequence);

    res.json({
      s:result.s,
      extreme:Boolean(result.extreme),
      mode:result.mode||"normal"
    });

  }catch(e){
    console.error("ANALYZE ERROR:",e);
    res.status(500).json({
      error:"No se pudo analizar la secuencia."
    });
  }
});
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));


app.listen(PORT,()=>console.log("BaccaTrack running on "+PORT));
