
const express=require("express"), path=require("path"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), Database=require("better-sqlite3");
const app=express(), PORT=process.env.PORT||3000, SECRET=process.env.JWT_SECRET;if(!SECRET)throw new Error("JWT_SECRET no configurado");
const engine=require("./motor_baccatrack_engine");
const db=new Database(process.env.DB_PATH||"baccatrack.db");
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',license_expires TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,active INTEGER NOT NULL DEFAULT 1,last_login TEXT,last_activity TEXT);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,started_at TEXT DEFAULT CURRENT_TIMESTAMP,capital REAL DEFAULT 0,profit REAL DEFAULT 0,FOREIGN KEY(user_id) REFERENCES users(id));`);
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
      return res.status(400).json({error:"Ingresa un correo válido"});
    }

    if(password.length<6){
      return res.status(400).json({error:"La contraseña debe tener mínimo 6 caracteres"});
    }

    const existe=db.prepare("SELECT id FROM users WHERE email=?").get(email);

    if(existe){
      return res.status(409).json({error:"Este correo ya está registrado"});
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
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body.email||"").toLowerCase());if(!u||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Credenciales incorrectas"});if(u.active===0)return res.status(403).json({error:"Cuenta desactivada"});if(u.license_expires&&new Date(u.license_expires)<new Date())return res.status(403).json({error:"Licencia vencida"});db.prepare("UPDATE users SET last_login=CURRENT_TIMESTAMP,last_activity=CURRENT_TIMESTAMP WHERE id=?").run(u.id);const token=jwt.sign({id:u.id,email:u.email,role:u.role},SECRET,{expiresIn:"7d"});res.json({token,user:{id:u.id,email:u.email,role:u.role,license_expires:u.license_expires}})});
app.get("/api/users/activity",auth,(req,res)=>{
  if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});
  const rows=db.prepare("SELECT id,email,role,active,last_login,last_activity,license_expires FROM users ORDER BY id DESC").all();
  res.json(rows);
});app.post("/api/activity",auth,(req,res)=>{
  db.prepare("UPDATE users SET last_activity=CURRENT_TIMESTAMP WHERE id=?").run(req.user.id);
  res.json({ok:true});
});app.get("/api/me",auth,(req,res)=>{res.json({user:db.prepare("SELECT id,email,role,license_expires,created_at FROM users WHERE id=?").get(req.user.id)})});
app.get("/api/users",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});res.json(db.prepare("SELECT id,email,role,license_expires,created_at,active,last_login,last_activity FROM users ORDER BY id DESC").all())});
app.post("/api/users",auth,(req,res)=>{if(req.user.role!=="admin")return res.status(403).json({error:"Solo administrador"});try{const email=String(req.body.email||"").toLowerCase().trim(),pass=String(req.body.password||"");if(!email||pass.length<6)return res.status(400).json({error:"Email y contraseña válidos requeridos"});const days=Math.max(1,Number(req.body.days||30));const exp=new Date(Date.now()+days*86400000).toISOString();const hash=bcrypt.hashSync(pass,10);const r=db.prepare("INSERT INTO users(email,password,role,license_expires) VALUES(?,?,?,?)").run(email,hash,"user",exp);res.json({id:r.lastInsertRowid,email,license_expires:exp})}catch(e){res.status(400).json({error:"El usuario ya existe o los datos son inválidos"})}});
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
        error:"Se requieren al menos 4 rondas válidas."
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
