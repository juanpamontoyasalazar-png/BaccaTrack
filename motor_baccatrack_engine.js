const EXTREME_STREAK = 9;
const BALANCE_START = 35;

function currentStreak(a,t){let n=0;for(let i=a.length-1;i>=0&&a[i]===t;i--)n++;return n}
function previousStreak(a,t){
  let i=a.length-1;
  while(i>=0&&a[i]===t)i--;
  if(i<0)return 0;
  let n=0;
  for(;i>=0&&a[i]===a[a.length-1];i--)n++;
  return n;
}
function lastStreakBeforeSwitch(a,t){
  if(!a.length)return 0;
  let i=a.length-1;
  const last=a[i];
  while(i>=0&&a[i]===last)i--;
  if(i<0)return 0;
  const color=a[i];
  let n=0;
  for(;i>=0&&a[i]===color;i--)n++;
  return n;
}
function longestStreak(a,t){
  let best=0,n=0;
  for(const x of a){if(x===t){n++;best=Math.max(best,n)}else n=0}
  return best;
}
function isAlternating(a){
  if(a.length<4)return false;
  const w=a.slice(-6);
  for(let i=1;i<w.length;i++)if(w[i]===w[i-1])return false;
  return true;
}
function altExpected(a){
  const w=a.slice(-6);
  return w.length?w[w.length-1]==='B'?'J':'B':null;
}
function extreme(a){
  if(!a.length)return {active:false,color:null,len:0};
  const color=a[a.length-1],len=currentStreak(a,color);
  return {active:len>=EXTREME_STREAK,color,len};
}

function distributionRule(a){
  const b=a.filter(x=>x==='B').length,j=a.filter(x=>x==='J').length;
  const diff=Math.abs(b-j), dominant=b>=j?'B':'J', minority=dominant==='B'?'J':'B';
  if(a.length<BALANCE_START)return {mode:'normal',b,j,diff,pick:dominant};
  // 20/15: mantener el dominante. 20/10: activar sesgo hacia el menos frecuente.
  if(diff>=10)return {mode:'balance',b,j,diff,pick:minority};
  return {mode:'normal',b,j,diff,pick:dominant};
}

function analyzeSequence(a){

  if(a.length < 4){
    return {
      s:'W',
      reason:'Esperar: registra al menos 4 manos sin empate.',
      extreme:false,
      mode:'wait',
      factors:null
    };
  }

  // ==========================================================
  // REGLA 1 — RACHA EXTREMA 9+
  // ==========================================================

  const ex=extreme(a);

  if(ex.active){
    return {
      s:'X',
      reason:`NO SEGUIR OPERANDO EN ESTE CUADRO. Racha extrema de ${ex.len} ${ex.color==='B'?'BANCA':'JUGADOR'}.`,
      extreme:true,
      extremeColor:ex.color,
      extremeLen:ex.len,
      mode:'extreme',
      factors:{
        streak:ex.len,
        banca:a.filter(x=>x==='B').length,
        jugador:a.filter(x=>x==='J').length
      }
    };
  }

  const last=a[a.length-1];
  const lastLen=currentStreak(a,last);

  const banca=a.filter(x=>x==='B').length;
  const jugador=a.filter(x=>x==='J').length;

  // ==========================================================
  // REGLA 2 — ALTERNANCIA 1-1
  // ==========================================================

  if(isAlternating(a)){

    if(lastLen>=3){
      return {
        s:'W',
        reason:'Alternancia cortada por racha de 3. Señal cancelada; buscar nueva entrada.',
        extreme:false,
        mode:'alternancia_cortada',
        factors:{
          streak:lastLen,
          banca,
          jugador,
          pattern:'1-1'
        }
      };
    }

    const pick=altExpected(a);

    return {
      s:pick,
      reason:`Alternancia 1-1 detectada. Seguir con ${pick==='B'?'BANCA':'JUGADOR'} mientras continúe el patrón.`,
      extreme:false,
      mode:'alternating',
      factors:{
        streak:lastLen,
        banca,
        jugador,
        pattern:'1-1'
      }
    };
  }

  // ==========================================================
  // REGLA 3 — RACHA LARGA + CAMBIO CORTO
  // ==========================================================

  if(lastLen<=2){

    const previousStreak=lastStreakBeforeSwitch(a,last);

    if(previousStreak>=3){

      const oldColor=last==='B'?'J':'B';

      return {
        s:oldColor,
        reason:`Racha larga de ${previousStreak} en ${oldColor==='B'?'BANCA':'JUGADOR'} seguida por cambio de ${lastLen}. Mantener ${oldColor==='B'?'BANCA':'JUGADOR'}.`,
        extreme:false,
        mode:'long_streak',
        factors:{
          streak:lastLen,
          previousStreak,
          banca,
          jugador,
          pattern:'racha_larga'
        }
      };
    }
  }

  // ==========================================================
// REGLA 4 — DESDE LA MANO 35
// ==========================================================
//
// Desde la mano 35:
// mantener el lado dominante.
// No utiliza score.
// No utiliza diferencia de puntos.
// ==========================================================

if(a.length>=35){

  const pick=banca>=jugador?'B':'J';

  return {
    s:pick,
    reason:`Después de 35 manos: Banca ${banca} / Jugador ${jugador}. Se mantiene el dominante: ${pick==='B'?'BANCA':'JUGADOR'}.`,
    extreme:false,
    mode:'balance_dominant',
    factors:{
      streak:lastLen,
      banca:banca,
      jugador:jugador,
      pattern:'balance_dominante'
    }
  };
}

// ==========================================================
// REGLA 5 — RACHA ACTUAL
  // ==========================================================

  if(lastLen>=3){

    return {
      s:last,
      reason:`Racha activa de ${lastLen} en ${last==='B'?'BANCA':'JUGADOR'}. Mantener el color.`,
      extreme:false,
      mode:'streak',
      factors:{
        streak:lastLen,
        banca,
        jugador,
        pattern:'racha_actual'
      }
    };
  }

  // ==========================================================
  // SIN PATRON
  // ==========================================================

  return {
    s:'W',
    reason:'Esperar nueva confirmación de patrón.',
    extreme:false,
    mode:'wait',
    factors:{
      streak:lastLen,
      banca,
      jugador,
      pattern:'sin_patron'
    }
  };
}

module.exports = { analyzeSequence };
