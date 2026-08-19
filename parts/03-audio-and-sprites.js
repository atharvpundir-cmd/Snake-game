/* ============================================================================
   6. PROCEDURAL AUDIO  (Web Audio API only -- no samples)
   ============================================================================ */
var AC=null, MASTER=null, NOISEBUF=null, COMP=null;
function audioInit(){
  if(AC) return;
  try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  COMP=AC.createDynamicsCompressor();
  COMP.threshold.value=-14; COMP.knee.value=22; COMP.ratio.value=9;
  COMP.attack.value=0.003; COMP.release.value=0.22;
  MASTER=AC.createGain(); MASTER.gain.value=S.sfx;
  COMP.connect(MASTER); MASTER.connect(AC.destination);
  var len=AC.sampleRate*2; NOISEBUF=AC.createBuffer(1,len,AC.sampleRate);
  var d=NOISEBUF.getChannelData(0);
  for(var i=0;i<len;i++) d[i]=rnd()*2-1;
}
function acTime(){ return AC.currentTime; }
function nsrc(){ var s=AC.createBufferSource(); s.buffer=NOISEBUF; s.loop=true;
  s.playbackRate.value=rr(.85,1.15); return s; }
function env(node,t0,peak,atk,dec,curve){
  var g=AC.createGain(); g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(peak,t0+atk);
  if(curve==='lin') g.gain.linearRampToValueAtTime(0.0001,t0+atk+dec);
  else g.gain.exponentialRampToValueAtTime(0.0001,t0+atk+dec);
  node.connect(g); return g;
}
function spatial(g,pan,vol){
  var out=g;
  if(pan!==undefined && AC.createStereoPanner){
    var p=AC.createStereoPanner(); p.pan.value=clamp(pan,-1,1); out.connect(p); out=p;
  }
  if(vol!==undefined && vol!==1){ var gg=AC.createGain(); gg.gain.value=vol; out.connect(gg); out=gg; }
  out.connect(COMP); return out;
}
function noiseHit(t0,dur,type,freq,q,peak,pan,vol,curve){
  var s=nsrc(), f=AC.createBiquadFilter();
  f.type=type; f.frequency.setValueAtTime(freq,t0); f.Q.value=q||1;
  s.connect(f); var g=env(f,t0,peak,0.002,dur,curve); spatial(g,pan,vol);
  s.start(t0); s.stop(t0+dur+0.06); return f;
}
function toneHit(t0,f0,f1,dur,peak,type,pan,vol){
  var o=AC.createOscillator(); o.type=type||'sine';
  o.frequency.setValueAtTime(f0,t0);
  o.frequency.exponentialRampToValueAtTime(max(20,f1),t0+dur);
  var g=env(o,t0,peak,0.004,dur); spatial(g,pan,vol);
  o.start(t0); o.stop(t0+dur+0.05);
}
/* Voice budget: bot firefights can request hundreds of shots per second.
   Each shot builds a small node graph, so cap how many may be in flight and
   fall back to a cheap one-shot for anything far away. VOICES bleeds off in
   the main loop (see step()). */
var VOICES=0, VOICE_MAX=20;
function voiceOK(cost){
  cost=cost||1;
  if(VOICES+cost>VOICE_MAX) return false;
  VOICES+=cost; return true;
}
var SND={
  gunshot:function(kind,pan,vol){
    if(!AC) return; var t=acTime(); pan=pan||0; vol=vol===undefined?1:vol;
    if(vol<0.06) return;
    var near = vol>0.42;
    if(!voiceOK(near?3:1)) return;
    if(!near){                       // distant report: two nodes, no tail
      noiseHit(t,kind==='sniper'?0.16:0.07,'bandpass',kind==='sniper'?620:1500,1.2,0.4*vol,pan,1);
      toneHit(t,kind==='sniper'?170:150,55,0.10,0.22*vol,'sine',pan,1);
      return;
    }
    if(kind==='sniper'){
      toneHit(t,210,38,0.30,0.85,'sine',pan,vol);
      noiseHit(t,0.20,'lowpass',1500,1,0.9,pan,vol);
      noiseHit(t,0.05,'highpass',3200,0.7,0.55,pan,vol);
      // outdoor slap-back
      noiseHit(t+0.075,0.34,'bandpass',760,1.2,0.30*vol,pan*0.6,vol);
      noiseHit(t+0.185,0.55,'bandpass',430,1.1,0.16*vol,-pan*0.5,vol);
      noiseHit(t+0.33,0.75,'lowpass',300,0.9,0.09*vol,pan*0.2,vol);
    } else if(kind==='lmg'){
      toneHit(t,150,52,0.11,0.55,'square',pan,vol);
      noiseHit(t,0.10,'bandpass',1250,1.3,0.62,pan,vol);
      noiseHit(t,0.03,'highpass',4200,0.7,0.35,pan,vol);
      noiseHit(t+0.06,0.20,'bandpass',520,1.2,0.13*vol,pan*0.5,vol);
    } else { // smg / ar
      toneHit(t,175,60,0.075,0.42,'square',pan,vol);
      noiseHit(t,0.075,'bandpass',1850,1.1,0.55,pan,vol);
      noiseHit(t,0.022,'highpass',5200,0.8,0.32,pan,vol);
      noiseHit(t+0.05,0.16,'bandpass',640,1.4,0.10*vol,pan*0.5,vol);
    }
  },
  bolt:function(stage){
    if(!AC) return; var t=acTime();
    if(stage===0){ noiseHit(t,0.045,'bandpass',2400,7,0.30); toneHit(t,420,180,0.05,0.14,'square'); }
    else { noiseHit(t,0.05,'bandpass',1750,6,0.34); toneHit(t+0.01,300,110,0.07,0.18,'square');
           noiseHit(t+0.03,0.05,'highpass',3600,3,0.14); }
  },
  reload:function(stage){
    if(!AC) return; var t=acTime();
    if(stage===0){ noiseHit(t,0.06,'bandpass',1500,5,0.24); toneHit(t,260,140,0.06,0.1,'square'); }
    else if(stage===1){ noiseHit(t,0.08,'lowpass',900,1,0.30); toneHit(t,180,80,0.09,0.16,'square'); }
    else { noiseHit(t,0.05,'bandpass',2600,7,0.26); noiseHit(t+0.05,0.06,'bandpass',1300,5,0.2); }
  },
  hitmark:function(){ if(!AC) return; var t=acTime();
    toneHit(t,1500,1500,0.035,0.20,'square'); toneHit(t+0.035,1150,1150,0.045,0.16,'square'); },
  headshot:function(){ if(!AC) return; var t=acTime();
    toneHit(t,2100,2100,0.04,0.22,'square'); toneHit(t+0.04,1600,1600,0.05,0.18,'square');
    noiseHit(t,0.05,'highpass',3000,1,0.12); },
  kill:function(){ if(!AC) return; var t=acTime();
    [880,1174,1568].forEach(function(f,i){ toneHit(t+i*0.055,f,f,0.20,0.16,'triangle'); }); },
  medal:function(){ if(!AC) return; var t=acTime();
    [1046,1318,1568,2093].forEach(function(f,i){ toneHit(t+i*0.06,f,f,0.28,0.13,'sine'); });
    noiseHit(t,0.5,'highpass',4000,1,0.05); },
  hurt:function(){ if(!AC) return; var t=acTime();
    toneHit(t,140,60,0.18,0.35,'sine'); noiseHit(t,0.14,'lowpass',700,1,0.30);
    noiseHit(t,0.05,'bandpass',2200,2,0.12); },
  die:function(){ if(!AC) return; var t=acTime();
    toneHit(t,220,44,0.9,0.4,'sawtooth'); noiseHit(t,0.7,'lowpass',400,1,0.3); },
  step:function(vol,pan){ if(!AC) return; vol=vol===undefined?1:vol;
    if(vol<0.12||!voiceOK(1)) return; var t=acTime();
    noiseHit(t,0.055,'lowpass',rr(650,1050),1.2,0.10*vol,pan||0); },
  whiz:function(pan){ if(!AC||!voiceOK(1)) return; var t=acTime();
    var s=nsrc(), f=AC.createBiquadFilter(); f.type='bandpass'; f.Q.value=5.5;
    f.frequency.setValueAtTime(3400,t); f.frequency.exponentialRampToValueAtTime(700,t+0.16);
    s.connect(f); var g=env(f,t,0.22,0.01,0.16); spatial(g,pan||0);
    s.start(t); s.stop(t+0.25); },
  impact:function(pan,vol){ if(!AC) return; vol=vol===undefined?1:vol;
    if(vol<0.10||!voiceOK(1)) return; var t=acTime();
    noiseHit(t,0.09,'bandpass',rr(1100,2200),2.5,0.22*vol,pan||0);
    toneHit(t,rr(300,520),90,0.07,0.09*vol,'square',pan||0); },
  ads:function(inn){ if(!AC) return; var t=acTime();
    noiseHit(t,0.05,'bandpass',inn?2000:1500,6,0.13);
    toneHit(t,inn?520:380,inn?300:200,0.06,0.06,'square'); },
  swap:function(){ if(!AC) return; var t=acTime();
    noiseHit(t,0.07,'bandpass',1800,4,0.2); noiseHit(t+0.09,0.06,'bandpass',1100,4,0.16); },
  ui:function(hi){ if(!AC) return; var t=acTime();
    toneHit(t,hi?900:520,hi?900:520,0.05,0.09,'square'); },
  streak:function(){ if(!AC) return; var t=acTime();
    toneHit(t,300,900,0.4,0.14,'sawtooth'); toneHit(t+0.1,600,1400,0.4,0.10,'triangle');
    noiseHit(t,0.6,'bandpass',900,1.4,0.08); },
  uav:function(){ if(!AC) return; var t=acTime();
    for(var i=0;i<3;i++) toneHit(t+i*0.14,1400,1400,0.09,0.08,'sine'); },
  explode:function(pan,vol){ if(!AC) return; var t=acTime(); vol=vol===undefined?1:vol;
    toneHit(t,120,26,0.7,0.7*vol,'sine',pan); noiseHit(t,0.55,'lowpass',900,1,0.75*vol,pan);
    noiseHit(t+0.1,0.9,'bandpass',300,1,0.28*vol,pan); },
  jet:function(pan){ if(!AC) return; var t=acTime();
    var s=nsrc(), f=AC.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.4;
    f.frequency.setValueAtTime(320,t); f.frequency.linearRampToValueAtTime(1400,t+1.1);
    s.connect(f); var g=env(f,t,0.22,0.35,1.0,'lin'); spatial(g,pan||0);
    s.start(t); s.stop(t+1.6); }
};

/* ============================================================================
   7. SPRITE ART  (soldiers, weapons, FX billboards -- all drawn in code)
   ============================================================================ */
var SPR={};      // name -> {w,h,px}
var SOLDIER=[];  // [team][angle 0..7][pose 0..2]

function drawSoldier(g,w,h,ang,team,pose){
  // ang: 0 = facing camera, PI = back to camera
  var ca=cos(ang), sa=sin(ang);
  var cx=w*0.5, sc=h/96;
  var front=ca;                       // 1 facing us, -1 away
  var side=abs(sa);                   // 1 = profile
  var shoulder=lerp(15,22,abs(ca))*sc;
  var pal = team===0
    ? { suit:'#3f4b5a', suit2:'#2b3543', vest:'#4d5b6b', trim:'#7fb8de', skin:'#c99', helm:'#39434f', boot:'#20262e', acc:'#5fa8d6' }
    : { suit:'#5b5138', suit2:'#413a27', vest:'#6b5f42', trim:'#e07a4a', skin:'#b98', helm:'#4a4433', boot:'#2a2620', acc:'#e0703c' };
  var legPhase = pose===1 ? 1 : (pose===2 ? -1 : 0);

  if(pose===3){ // downed
    g.save(); g.translate(cx,h*0.86); g.rotate(-0.06); g.scale(1,0.42);
    g.fillStyle=pal.suit; g.beginPath(); g.ellipse(0,-14,26*sc,18*sc,0,0,TAU); g.fill();
    g.fillStyle=pal.helm; g.beginPath(); g.arc(-22*sc,-18,9*sc,0,TAU); g.fill();
    g.fillStyle='rgba(120,0,0,.55)'; g.beginPath(); g.ellipse(0,4,32*sc,15*sc,0,0,TAU); g.fill();
    g.restore(); return;
  }
  // ---- shadow
  g.fillStyle='rgba(0,0,0,.34)';
  g.beginPath(); g.ellipse(cx,h-4,shoulder*1.15,5*sc,0,0,TAU); g.fill();
  // ---- legs
  var ly=h*0.52, lh=h*0.44;
  for(var i=0;i<2;i++){
    var dirn=i?1:-1, sw=legPhase*dirn*6*sc*(1-side*0.35);
    g.fillStyle=i?pal.suit2:pal.suit;
    g.save(); g.translate(cx+dirn*shoulder*0.36+sa*2*sc, ly);
    g.rotate(sw*0.03);
    g.fillRect(-4.6*sc,0,9.2*sc,lh*0.92);
    g.fillStyle=pal.boot; g.fillRect(-5.4*sc,lh*0.86,11*sc,lh*0.14);
    g.restore();
  }
  // ---- torso
  g.fillStyle=pal.suit;
  g.beginPath();
  g.moveTo(cx-shoulder, h*0.245);
  g.lineTo(cx+shoulder, h*0.245);
  g.lineTo(cx+shoulder*0.82, h*0.56);
  g.lineTo(cx-shoulder*0.82, h*0.56);
  g.closePath(); g.fill();
  // vest plate
  g.fillStyle=pal.vest;
  g.fillRect(cx-shoulder*0.72, h*0.275, shoulder*1.44, h*0.22);
  g.fillStyle='rgba(0,0,0,.28)';
  g.fillRect(cx-shoulder*0.72, h*0.275+h*0.09, shoulder*1.44, 2*sc);
  if(front>0.1){ // front pouches + team stripe
    g.fillStyle=pal.suit2;
    g.fillRect(cx-shoulder*0.6,h*0.40,shoulder*0.5,h*0.08);
    g.fillRect(cx+shoulder*0.1,h*0.40,shoulder*0.5,h*0.08);
    g.fillStyle=pal.trim; g.fillRect(cx-shoulder*0.72,h*0.285,shoulder*1.44,2.4*sc);
  } else {
    g.fillStyle=pal.acc; g.fillRect(cx-shoulder*0.36,h*0.31,shoulder*0.72,h*0.06); // backpack tag
    g.fillStyle=pal.suit2; g.fillRect(cx-shoulder*0.55,h*0.30,shoulder*1.1,h*0.17);
  }
  // ---- shoulders / arms
  g.fillStyle=pal.suit2;
  g.fillRect(cx-shoulder-2.5*sc, h*0.26, 5.5*sc, h*0.20);
  g.fillRect(cx+shoulder-3*sc,  h*0.26, 5.5*sc, h*0.20);
  // ---- head
  var hy=h*0.175, hr=8.4*sc;
  g.fillStyle=pal.skin;
  g.beginPath(); g.arc(cx+sa*1.4*sc, hy, hr*0.86,0,TAU); g.fill();
  g.fillStyle=pal.helm;
  g.beginPath(); g.arc(cx+sa*1.4*sc, hy-1*sc, hr, PI*1.02, PI*1.98); g.fill();
  g.fillRect(cx+sa*1.4*sc-hr, hy-2*sc, hr*2, hr*0.5);
  if(front>0){ // visor + face gear
    g.fillStyle='rgba(20,30,40,.92)';
    g.fillRect(cx+sa*1.4*sc-hr*0.8, hy-1.5*sc, hr*1.6*Math.max(0.35,ca), hr*0.55);
    g.fillStyle=pal.trim; g.globalAlpha=.55;
    g.fillRect(cx+sa*1.4*sc-hr*0.8, hy-1.5*sc, hr*1.6*Math.max(0.35,ca), 1.4*sc);
    g.globalAlpha=1;
    g.fillStyle=pal.suit2;
    g.fillRect(cx+sa*1.4*sc-hr*0.7, hy+2.4*sc, hr*1.4*Math.max(0.35,ca), hr*0.5);
  } else {
    g.fillStyle='#1d232a';
    g.beginPath(); g.arc(cx+sa*1.4*sc, hy, hr*0.55,0,TAU); g.fill();
  }
  // ---- rifle (held across the body; length reads with the view angle)
  var gunLen = lerp(10,30,side)*sc, gy=h*0.40;
  var gx = cx + sa*shoulder*0.55;
  g.save(); g.translate(gx,gy); g.rotate(-0.12*(sa>0?1:-1));
  g.fillStyle='#20262c';
  g.fillRect(-gunLen*0.35, -2.4*sc, gunLen, 4.6*sc);
  g.fillStyle='#2f3740'; g.fillRect(-gunLen*0.35, -5.4*sc, gunLen*0.42, 3.2*sc);
  g.fillStyle='#171b20'; g.fillRect(-gunLen*0.18, 2*sc, 4.5*sc, 7*sc);
  g.restore();
  // hands
  g.fillStyle=pal.suit2;
  g.beginPath(); g.arc(gx+gunLen*0.42, gy+1*sc, 3.1*sc,0,TAU); g.fill();
  g.beginPath(); g.arc(gx-gunLen*0.16, gy+2*sc, 3.1*sc,0,TAU); g.fill();
  // rim light from the sun
  g.globalCompositeOperation='source-atop';
  var rg=g.createLinearGradient(cx-shoulder,0,cx+shoulder,0);
  rg.addColorStop(0,'rgba(255,240,205,.28)'); rg.addColorStop(.5,'rgba(255,240,205,0)');
  rg.addColorStop(1,'rgba(120,160,200,.12)');
  g.fillStyle=rg; g.fillRect(0,0,w,h);
  g.globalCompositeOperation='source-over';
}

function buildSprites(){
  var SW=64, SH=96;
  for(var t=0;t<2;t++){
    SOLDIER[t]=[];
    for(var a=0;a<8;a++){
      SOLDIER[t][a]=[];
      for(var p=0;p<3;p++){
        (function(tt,aa,pp){
          SOLDIER[tt][aa][pp]=TEX(SW,SH,function(g,w,h){
            drawSoldier(g,w,h, aa/8*TAU, tt, pp);
          });
        })(t,a,p);
      }
    }
    SOLDIER[t].dead=TEX(SW,SH,function(g,w,h){ drawSoldier(g,w,h,0,t,3); });
  }
  // ---- dropped weapon pickup ------------------------------------------
  SPR.pickup=TEX(72,40,function(g,w,h){
    g.save(); g.translate(w/2,h/2+6); g.rotate(-0.13);
    g.fillStyle='#1e242b'; g.fillRect(-27,-4,54,8);
    g.fillStyle='#2e3740'; g.fillRect(-27,-9,20,5); g.fillRect(6,-8,15,4);
    g.fillStyle='#161a1f'; g.fillRect(-8,4,7,11); g.fillRect(14,-2,13,5);
    g.fillStyle='#3d4954'; g.fillRect(-30,-3,6,6);
    g.restore();
    var gr=g.createRadialGradient(w/2,h/2+4,2,w/2,h/2+4,30);
    gr.addColorStop(0,'rgba(255,200,60,.42)'); gr.addColorStop(1,'rgba(255,200,60,0)');
    g.fillStyle=gr; g.fillRect(0,0,w,h);
  });
  // ---- FX billboards ---------------------------------------------------
  SPR.flash=TEX(64,64,function(g,w,h){
    var gr=g.createRadialGradient(32,32,1,32,32,30);
    gr.addColorStop(0,'rgba(255,255,235,1)'); gr.addColorStop(.22,'rgba(255,218,120,.92)');
    gr.addColorStop(.55,'rgba(255,150,30,.42)'); gr.addColorStop(1,'rgba(255,110,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(32,32,30,0,TAU); g.fill();
    g.fillStyle='rgba(255,246,210,.9)';
    for(var i=0;i<4;i++){ g.save(); g.translate(32,32); g.rotate(i*PI/4);
      g.fillRect(-30,-2.2,60,4.4); g.restore(); }
  });
  SPR.blood=TEX(48,48,function(g,w,h){
    for(var i=0;i<26;i++){
      g.fillStyle='rgba('+ri(140,215)+',10,6,'+rr(.35,.85)+')';
      g.beginPath(); g.arc(24+rr(-13,13),24+rr(-13,13),rr(1.6,6),0,TAU); g.fill();
    }
  });
  SPR.smoke=TEX(64,64,function(g,w,h){
    for(var i=0;i<16;i++){
      var a=rr(.05,.18);
      g.fillStyle='rgba(205,205,200,'+a+')';
      g.beginPath(); g.arc(32+rr(-12,12),32+rr(-12,12),rr(7,19),0,TAU); g.fill();
    }
  });
  SPR.debris=TEX(32,32,function(g,w,h){
    for(var i=0;i<14;i++){
      g.fillStyle='rgba('+ri(180,235)+','+ri(180,235)+','+ri(175,225)+','+rr(.4,.9)+')';
      g.fillRect(16+rr(-11,11),16+rr(-11,11),rr(1,3.4),rr(1,3.4));
    }
  });
  SPR.spark=TEX(32,32,function(g,w,h){
    var gr=g.createRadialGradient(16,16,0,16,16,15);
    gr.addColorStop(0,'rgba(255,255,220,1)'); gr.addColorStop(.35,'rgba(255,190,80,.8)');
    gr.addColorStop(1,'rgba(255,140,20,0)');
    g.fillStyle=gr; g.fillRect(0,0,32,32);
  });
  SPR.drone=TEX(64,32,function(g,w,h){
    g.fillStyle='#2b3239'; g.fillRect(10,12,44,8);
    g.fillStyle='#3d4750'; g.fillRect(4,14,10,4); g.fillRect(50,10,12,10);
    g.fillStyle='#1a1f25'; g.fillRect(20,20,24,4);
    g.fillStyle='#ff5533'; g.beginPath(); g.arc(52,15,2.5,0,TAU); g.fill();
    g.fillStyle='rgba(255,180,60,.5)'; g.beginPath(); g.moveTo(10,16);
    g.lineTo(-6,12); g.lineTo(-6,20); g.closePath(); g.fill();
  });
}
