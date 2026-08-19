/* ============================================================================
   6. AUDIO  --  modelled weapon acoustics baked into buffers at load
   ----------------------------------------------------------------------------
   No sample files (nothing external may be loaded), so every sound is
   synthesised -- but instead of firing a throwaway oscillator graph per shot,
   each effect is rendered once into an AudioBuffer using DSP that models how
   the real thing actually radiates:

     muzzle blast : broadband noise through a fast downward cutoff sweep,
                    driven into saturation for the nonlinear crack
     body         : low-frequency thump with a pitch drop as pressure vents
     mechanics    : modal ringing (inharmonic decaying partials) for metal
     space        : a procedural impulse response convolved at play time,
                    so the same shot picks up the arena's slap-back

   Playback is then just buffer -> gain -> pan -> (dry + reverb send), which is
   both far more realistic and much cheaper than the old per-shot node graphs.
   ============================================================================ */
var AC=null, MASTER=null, COMP=null, NOISEBUF=null;
var REVERB=null, REV_SEND=null, DRY=null;
var SFX={}, SFX_READY=false;

/* ---- tiny DSP helpers (operate on plain Float32Arrays) ------------------ */
function dspNoise(){ return Math.random()*2-1; }
function onePoleCoef(fc,sr){ return 1-Math.exp(-2*PI*fc/sr); }
/* sum of exponentially decaying inharmonic partials -- reads as struck metal */
function modal(t, parts){
  var s=0;
  for(var i=0;i<parts.length;i+=3)
    s+=Math.sin(TAU*parts[i]*t)*Math.exp(-t/parts[i+1])*parts[i+2];
  return s;
}
function newBuf(dur){
  var n=max(8,(AC.sampleRate*dur)|0);
  return AC.createBuffer(1,n,AC.sampleRate);
}
function normalize(d,peak){
  var m=0;
  for(var i=0;i<d.length;i++){ var a=d[i]<0?-d[i]:d[i]; if(a>m)m=a; }
  if(m<1e-6) return;
  var k=(peak||0.92)/m;
  for(var j=0;j<d.length;j++) d[j]*=k;
}
/* short fade so buffers never click on the tail */
function fadeOut(d,ms,sr){
  var n=(sr*ms/1000)|0, s=d.length-n;
  for(var i=0;i<n;i++) d[s+i]*=1-i/n;
}

/* ---- impulse response: outdoor courtyard with hard façades -------------- */
function bakeIR(){
  var sr=AC.sampleRate, dur=1.6, n=(sr*dur)|0;
  var buf=AC.createBuffer(2,n,sr);
  // discrete early reflections (concrete walls at varied distances)
  var taps=[[0.011,.62],[0.019,.48],[0.028,.55],[0.041,.36],[0.057,.42],
            [0.073,.28],[0.096,.31],[0.124,.22],[0.161,.18],[0.208,.13]];
  for(var ch=0;ch<2;ch++){
    var d=buf.getChannelData(ch), lp=0;
    for(var i=0;i<n;i++){
      var t=i/sr;
      // diffuse exponential tail, darkening as it decays
      var env=Math.exp(-t*4.2);
      var nz=dspNoise()*env;
      lp+=onePoleCoef(3200*Math.exp(-t*1.4)+220,sr)*(nz-lp);
      d[i]=lp*0.6;
    }
    for(var k=0;k<taps.length;k++){
      var idx=((taps[k][0]+(ch?0.0013:0))*sr)|0;
      if(idx<n) d[idx]+=taps[k][1]*(ch?0.92:1);
    }
    fadeOut(d,60,sr);
  }
  return buf;
}

/* ---- weapon report ------------------------------------------------------ */
function bakeGunshot(kind,seed){
  var sr=AC.sampleRate;
  var cfg = kind==='sniper'
      ? {dur:0.95, blast:0.130, thump:48,  tdec:0.30, bright:11000, dark:150, crack:1.15, mech:0.30, drive:2.3}
    : kind==='lmg'
      ? {dur:0.62, blast:0.080, thump:62,  tdec:0.17, bright:9000,  dark:230, crack:0.90, mech:0.42, drive:2.0}
      : {dur:0.50, blast:0.058, thump:76,  tdec:0.12, bright:8200,  dark:300, crack:0.78, mech:0.48, drive:1.8};
  var n=(sr*cfg.dur)|0, buf=newBuf(cfg.dur), d=buf.getChannelData(0);
  var lp=0, lp2=0;
  var jitter=1+(seed-1)*0.045;                    // per-variant character
  for(var i=0;i<n;i++){
    var t=i/sr, s=0;
    /* 1. muzzle blast: noise, cutoff sweeping bright -> dark very fast */
    var benv=Math.exp(-t/(cfg.blast*0.40));
    if(benv>0.0006){
      var k=min(1,t/(cfg.blast*1.5));
      var fc=cfg.bright*Math.pow(cfg.dark/cfg.bright,k)*jitter;
      lp+=onePoleCoef(fc,sr)*(dspNoise()-lp);
      s+=lp*benv*1.5;
    }
    /* 2. leading crack: 2ms of full-bandwidth energy */
    if(t<0.005) s+=dspNoise()*Math.exp(-t/0.0013)*cfg.crack;
    /* 3. body thump with a downward pitch bend as the gas vents */
    var f=cfg.thump*(1+0.9*Math.exp(-t*26))*jitter;
    s+=Math.sin(TAU*f*t)*Math.exp(-t/cfg.tdec)*0.80;
    s+=Math.sin(TAU*f*1.94*t)*Math.exp(-t/(cfg.tdec*0.55))*0.22;
    /* 4. action / receiver ring */
    s+=modal(t,[1840*jitter,0.030,1, 3160*jitter,0.020,0.6, 5450*jitter,0.012,0.35])*cfg.mech*0.20;
    /* 5. nonlinear saturation -- what gives a real report its bite */
    s=Math.tanh(s*cfg.drive)/Math.tanh(cfg.drive);
    /* 6. low residual rumble rolling away */
    lp2+=onePoleCoef(90,sr)*(dspNoise()*Math.exp(-t*13)-lp2);
    s+=lp2*0.30;
    /* 7. master decay: a real report is nearly gone in ~200ms -- everything
       after that belongs to the room, which the convolver supplies */
    if(t>0.06) s*=Math.exp(-(t-0.06)*11);
    d[i]=s;
  }
  normalize(d,0.95); fadeOut(d,40,sr);
  return buf;
}

/* ---- mechanical: bolt cycle, magazine, charging handle ------------------ */
function bakeMech(type){
  var sr=AC.sampleRate;
  var spec = {
    boltBack : {dur:0.18, parts:[2350,0.030,1, 4100,0.018,0.5, 6200,0.010,0.25], nz:0.55, nzf:2600, nzd:0.030},
    boltFwd  : {dur:0.24, parts:[1560,0.040,1, 2740,0.024,0.6, 4300,0.014,0.3],  nz:0.75, nzf:1800, nzd:0.045},
    magOut   : {dur:0.20, parts:[1180,0.035,1, 2260,0.020,0.45],                 nz:0.50, nzf:1500, nzd:0.035},
    magIn    : {dur:0.28, parts:[ 620,0.055,1, 1340,0.030,0.55, 2900,0.016,0.25],nz:0.85, nzf:900,  nzd:0.055},
    charge   : {dur:0.22, parts:[2050,0.036,1, 3450,0.020,0.55, 5100,0.012,0.3], nz:0.70, nzf:2300, nzd:0.040},
    swap     : {dur:0.26, parts:[ 880,0.045,1, 1720,0.026,0.5],                  nz:0.60, nzf:1300, nzd:0.048}
  }[type];
  var n=(sr*spec.dur)|0, buf=newBuf(spec.dur), d=buf.getChannelData(0), lp=0;
  for(var i=0;i<n;i++){
    var t=i/sr;
    var s=modal(t,spec.parts)*0.6;
    lp+=onePoleCoef(spec.nzf,sr)*(dspNoise()-lp);
    s+=lp*Math.exp(-t/spec.nzd)*spec.nz;
    d[i]=Math.tanh(s*1.5)*0.8;
  }
  normalize(d,0.85); fadeOut(d,20,sr);
  return buf;
}

/* ---- surface impacts ---------------------------------------------------- */
function bakeImpact(mat){
  var sr=AC.sampleRate;
  var spec = {
    concrete:{dur:0.30, f:1500, dec:0.045, parts:[420,0.05,0.5], grit:1.0, drive:1.6},
    metal   :{dur:0.55, f:2600, dec:0.030, parts:[1950,0.16,1, 3480,0.11,0.6, 5900,0.07,0.35], grit:0.5, drive:2.0},
    wood    :{dur:0.26, f:1000, dec:0.040, parts:[280,0.07,0.7, 640,0.04,0.4], grit:0.7, drive:1.4},
    glass   :{dur:0.60, f:5200, dec:0.025, parts:[3900,0.19,1, 6100,0.14,0.7, 8300,0.09,0.4], grit:0.6, drive:1.5},
    flesh   :{dur:0.22, f:520,  dec:0.055, parts:[150,0.06,0.6], grit:0.9, drive:1.2},
    dirt    :{dur:0.24, f:700,  dec:0.050, parts:[190,0.05,0.4], grit:1.0, drive:1.2}
  }[mat];
  var n=(sr*spec.dur)|0, buf=newBuf(spec.dur), d=buf.getChannelData(0), lp=0;
  for(var i=0;i<n;i++){
    var t=i/sr;
    lp+=onePoleCoef(spec.f,sr)*(dspNoise()-lp);
    var s=lp*Math.exp(-t/spec.dec)*spec.grit;
    s+=modal(t,spec.parts)*0.5;
    d[i]=Math.tanh(s*spec.drive)*0.75;
  }
  normalize(d,0.8); fadeOut(d,25,sr);
  return buf;
}

/* ---- footsteps per surface --------------------------------------------- */
function bakeStep(surf){
  var sr=AC.sampleRate;
  var spec = {
    stone:{dur:0.16, f:1400, dec:0.028, thump:150, tdec:0.030, grit:0.55},
    grass:{dur:0.20, f:3600, dec:0.055, thump:110, tdec:0.022, grit:0.85},
    dirt :{dur:0.18, f:2200, dec:0.045, thump:120, tdec:0.026, grit:0.80},
    tile :{dur:0.15, f:2600, dec:0.022, thump:190, tdec:0.024, grit:0.45}
  }[surf];
  var n=(sr*spec.dur)|0, buf=newBuf(spec.dur), d=buf.getChannelData(0), lp=0;
  for(var i=0;i<n;i++){
    var t=i/sr;
    lp+=onePoleCoef(spec.f,sr)*(dspNoise()-lp);
    var s=lp*Math.exp(-t/spec.dec)*spec.grit;
    s+=Math.sin(TAU*spec.thump*t)*Math.exp(-t/spec.tdec)*0.5;
    d[i]=s;
  }
  normalize(d,0.55); fadeOut(d,20,sr);
  return buf;
}

/* ---- bullet passing close (Doppler-ish crack then swish) ---------------- */
function bakeWhiz(){
  var sr=AC.sampleRate, dur=0.30, n=(sr*dur)|0;
  var buf=newBuf(dur), d=buf.getChannelData(0), bp=0, bp2=0;
  for(var i=0;i<n;i++){
    var t=i/sr;
    var fc=4200*Math.exp(-t*11)+380;
    var nz=dspNoise();
    bp+=onePoleCoef(fc,sr)*(nz-bp);
    bp2+=onePoleCoef(fc*0.55,sr)*(bp-bp2);
    d[i]=(bp-bp2)*Math.exp(-t/0.075)*1.6;
  }
  normalize(d,0.7); fadeOut(d,30,sr);
  return buf;
}

/* ---- explosion ---------------------------------------------------------- */
function bakeExplosion(){
  var sr=AC.sampleRate, dur=2.1, n=(sr*dur)|0;
  var buf=newBuf(dur), d=buf.getChannelData(0), lp=0, lp2=0;
  for(var i=0;i<n;i++){
    var t=i/sr, s=0;
    if(t<0.004) s+=dspNoise()*Math.exp(-t/0.0012)*1.2;
    var fc=5200*Math.exp(-t*7)+90;
    lp+=onePoleCoef(fc,sr)*(dspNoise()-lp);
    s+=lp*Math.exp(-t/0.34)*1.6;
    s+=Math.sin(TAU*(46*(1+1.4*Math.exp(-t*13)))*t)*Math.exp(-t/0.45)*0.95;
    lp2+=onePoleCoef(60,sr)*(dspNoise()*Math.exp(-t*2.2)-lp2);
    s+=lp2*0.9;
    d[i]=Math.tanh(s*1.7)*0.9;
  }
  normalize(d,0.97); fadeOut(d,120,sr);
  return buf;
}

/* ---- pain / death ------------------------------------------------------- */
function bakeHurt(){
  var sr=AC.sampleRate, dur=0.5, n=(sr*dur)|0;
  var buf=newBuf(dur), d=buf.getChannelData(0), lp=0;
  for(var i=0;i<n;i++){
    var t=i/sr;
    lp+=onePoleCoef(700*Math.exp(-t*5)+120,sr)*(dspNoise()-lp);
    var s=lp*Math.exp(-t/0.11)*1.3;
    s+=Math.sin(TAU*120*(1-0.35*t)*t)*Math.exp(-t/0.16)*0.6;
    d[i]=Math.tanh(s*1.4)*0.8;
  }
  normalize(d,0.8); fadeOut(d,40,sr);
  return buf;
}

/* ---- bake everything --------------------------------------------------- */
function bakeAll(){
  SFX.sniper=[bakeGunshot('sniper',0),bakeGunshot('sniper',1),bakeGunshot('sniper',2)];
  SFX.smg   =[bakeGunshot('smg',0),   bakeGunshot('smg',1),   bakeGunshot('smg',2)];
  SFX.lmg   =[bakeGunshot('lmg',0),   bakeGunshot('lmg',1),   bakeGunshot('lmg',2)];
  SFX.boltBack=[bakeMech('boltBack')]; SFX.boltFwd=[bakeMech('boltFwd')];
  SFX.magOut=[bakeMech('magOut')];     SFX.magIn=[bakeMech('magIn')];
  SFX.charge=[bakeMech('charge')];     SFX.swap=[bakeMech('swap')];
  SFX.concrete=[bakeImpact('concrete')]; SFX.metal=[bakeImpact('metal')];
  SFX.wood=[bakeImpact('wood')];         SFX.glass=[bakeImpact('glass')];
  SFX.flesh=[bakeImpact('flesh')];       SFX.dirt=[bakeImpact('dirt')];
  SFX.stepStone=[bakeStep('stone')];  SFX.stepGrass=[bakeStep('grass')];
  SFX.stepDirt=[bakeStep('dirt')];    SFX.stepTile=[bakeStep('tile')];
  SFX.whiz=[bakeWhiz()];
  SFX.boom=[bakeExplosion()];
  SFX.hurt=[bakeHurt()];
  SFX_READY=true;
}

function audioInit(){
  if(AC) return;
  try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  COMP=AC.createDynamicsCompressor();
  COMP.threshold.value=-11; COMP.knee.value=20; COMP.ratio.value=8;
  COMP.attack.value=0.002; COMP.release.value=0.20;
  MASTER=AC.createGain(); MASTER.gain.value=S.sfx;
  COMP.connect(MASTER); MASTER.connect(AC.destination);
  DRY=AC.createGain(); DRY.gain.value=1; DRY.connect(COMP);
  REVERB=AC.createConvolver();
  REV_SEND=AC.createGain(); REV_SEND.gain.value=1;
  REV_SEND.connect(REVERB); REVERB.connect(COMP);
  var len=AC.sampleRate*2; NOISEBUF=AC.createBuffer(1,len,AC.sampleRate);
  var nd=NOISEBUF.getChannelData(0);
  for(var i=0;i<len;i++) nd[i]=Math.random()*2-1;
  try{ REVERB.buffer=bakeIR(); }catch(e){}
  bakeAll();
}
function acTime(){ return AC.currentTime; }

/* Voice budget: a 4v4 firefight can ask for hundreds of sounds a second. */
var VOICES=0, VOICE_MAX=22;
function voiceOK(cost){
  cost=cost||1;
  if(VOICES+cost>VOICE_MAX) return false;
  VOICES+=cost; return true;
}

/* ---- one-shot buffer playback ------------------------------------------ */
function play(name,opt){
  if(!AC||!SFX_READY) return null;
  var list=SFX[name]; if(!list) return null;
  opt=opt||{};
  var vol=opt.vol===undefined?1:opt.vol;
  if(vol<0.02) return null;
  var src=AC.createBufferSource();
  src.buffer=list.length>1?list[(Math.random()*list.length)|0]:list[0];
  src.playbackRate.value=opt.rate||1;
  var g=AC.createGain(); g.gain.value=vol;
  src.connect(g);
  var out=g;
  if(opt.pan!==undefined && AC.createStereoPanner){
    var p=AC.createStereoPanner(); p.pan.value=clamp(opt.pan,-1,1);
    g.connect(p); out=p;
  }
  out.connect(DRY);
  var send=opt.send===undefined?0.22:opt.send;
  if(send>0 && REVERB.buffer){
    var sg=AC.createGain(); sg.gain.value=send*vol;
    out.connect(sg); sg.connect(REV_SEND);
  }
  src.start(opt.when||0);
  return src;
}
/* small helper kept for the arcade UI cues, which should stay synthetic */
function beep(f0,f1,dur,peak,type,pan,vol){
  if(!AC) return;
  var t=acTime();
  var o=AC.createOscillator(); o.type=type||'sine';
  o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(max(20,f1),t+dur);
  var g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(peak*(vol===undefined?1:vol),t+0.004);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);
  var out=g;
  if(pan!==undefined && AC.createStereoPanner){
    var p=AC.createStereoPanner(); p.pan.value=clamp(pan,-1,1); g.connect(p); out=p;
  }
  out.connect(COMP);
  o.start(t); o.stop(t+dur+0.05);
}

var SND={
  gunshot:function(kind,pan,vol){
    if(!AC) return; vol=vol===undefined?1:vol;
    if(vol<0.05) return;
    var near=vol>0.4;
    if(!voiceOK(near?2:1)) return;
    play(kind==='sniper'?'sniper':kind==='lmg'?'lmg':'smg',
      {pan:pan||0, vol:vol*(near?1:0.8), rate:0.97+rnd()*0.06,
       send:near?0.30:0.16});
  },
  bolt:function(stage){
    if(!AC||!voiceOK(1)) return;
    play(stage===0?'boltBack':'boltFwd',{vol:0.85,rate:0.97+rnd()*0.06,send:0.12});
  },
  reload:function(stage){
    if(!AC||!voiceOK(1)) return;
    play(stage===0?'magOut':stage===1?'magIn':'charge',
      {vol:0.8,rate:0.97+rnd()*0.06,send:0.12});
  },
  swap:function(){ if(!AC||!voiceOK(1)) return;
    play('swap',{vol:0.7,rate:0.96+rnd()*0.08,send:0.10}); },
  impact:function(pan,vol,mat){
    if(!AC) return; vol=vol===undefined?1:vol;
    if(vol<0.09||!voiceOK(1)) return;
    play(mat||'concrete',{pan:pan||0,vol:vol*0.85,rate:0.9+rnd()*0.25,send:0.25});
  },
  step:function(vol,pan,surf){
    if(!AC) return; vol=vol===undefined?1:vol;
    if(vol<0.10||!voiceOK(1)) return;
    play(surf||'stepStone',{pan:pan||0,vol:vol*0.5,rate:0.92+rnd()*0.18,send:0.14});
  },
  whiz:function(pan){ if(!AC||!voiceOK(1)) return;
    play('whiz',{pan:pan||0,vol:0.6,rate:0.9+rnd()*0.25,send:0.12}); },
  hurt:function(){ if(!AC||!voiceOK(1)) return;
    play('hurt',{vol:0.9,rate:0.95+rnd()*0.1,send:0.18}); },
  die:function(){ if(!AC) return;
    play('hurt',{vol:1,rate:0.72,send:0.3});
    beep(200,42,0.9,0.25,'sawtooth'); },
  explode:function(pan,vol){
    if(!AC||!voiceOK(3)) return; vol=vol===undefined?1:vol;
    play('boom',{pan:pan||0,vol:vol,rate:0.9+rnd()*0.2,send:0.5});
  },
  /* --- arcade UI cues stay deliberately synthetic --- */
  hitmark:function(){ if(!AC) return;
    beep(1500,1500,0.035,0.20,'square'); beep(1150,1150,0.045,0.16,'square'); },
  headshot:function(){ if(!AC) return;
    beep(2100,2100,0.04,0.22,'square'); beep(1600,1600,0.05,0.18,'square'); },
  kill:function(){ if(!AC) return;
    [880,1174,1568].forEach(function(f,i){
      setTimeout(function(){ beep(f,f,0.20,0.15,'triangle'); },i*55); }); },
  medal:function(){ if(!AC) return;
    [1046,1318,1568,2093].forEach(function(f,i){
      setTimeout(function(){ beep(f,f,0.26,0.12,'sine'); },i*60); }); },
  ads:function(inn){ if(!AC||!voiceOK(1)) return;
    play('swap',{vol:0.30,rate:inn?1.45:1.2,send:0.06}); },
  ui:function(hi){ if(!AC) return; beep(hi?900:520,hi?900:520,0.05,0.09,'square'); },
  streak:function(){ if(!AC) return;
    beep(300,900,0.4,0.13,'sawtooth'); beep(600,1400,0.4,0.09,'triangle'); },
  uav:function(){ if(!AC) return;
    for(var i=0;i<3;i++) (function(k){
      setTimeout(function(){ beep(1400,1400,0.09,0.08,'sine'); },k*140); })(i); },
  jet:function(pan){ if(!AC||!voiceOK(2)) return;
    play('boom',{pan:pan||0,vol:0.35,rate:0.45,send:0.4}); }
};
