<script>
(function(){
'use strict';
/* ============================================================================
   0. UTILITIES
   ============================================================================ */
var TAU = Math.PI * 2, PI = Math.PI;
var abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor,
    sqrt = Math.sqrt, sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, rnd = Math.random;
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function rr(a,b){ return a+rnd()*(b-a); }
function ri(a,b){ return floor(a+rnd()*(b-a+1)); }
function pick(a){ return a[floor(rnd()*a.length)]; }
function angDiff(a,b){ var d=(a-b+PI)%TAU; if(d<0)d+=TAU; return d-PI; }
function approach(cur,tgt,step){ return cur<tgt ? min(cur+step,tgt) : max(cur-step,tgt); }
function $(id){ return document.getElementById(id); }
function el(tag,cls,html){ var e=document.createElement(tag); if(cls)e.className=cls;
  if(html!=null)e.innerHTML=html; return e; }

/* ============================================================================
   1. DOM HANDLES
   ============================================================================ */
var view=$('view'), vctx=view.getContext('2d',{alpha:false}),
    fx=$('fx'),   fctx=fx.getContext('2d');
var D = {
  hud:$('hud'), vig:$('vig'), lowhp:$('lowhp'), flash:$('flash'), dirs:$('dirs'),
  medals:$('medals'), pts:$('pts'), feed:$('feed'), ann:$('ann'),
  sF:$('sFriend'), sE:$('sEnemy'), clock:$('clock'),
  gunName:$('gunName'), mag:$('mag'), res:$('res'), fireMode:$('fireMode'),
  reloadbar:$('reloadbar'), reloadfill:$('reloadbar').firstElementChild,
  streaks:$('streaks'), pick:$('pick'), pickTxt:$('pick').querySelector('.t'),
  pickKey:$('pick').querySelector('.k'), pickFill:$('pick').querySelector('.ring i'),
  mini:$('mini'), minic:$('minic'), board:$('board'), boardBody:$('boardBody'),
  killed:$('killed'), killedName:$('killedName'),
  touch:$('touch'), rotate:$('rotate'),
  menu:$('menu'), panel:$('panel'), loading:$('loading')
};
var mctx = D.minic.getContext('2d');

/* ============================================================================
   2. SETTINGS (persisted)
   ============================================================================ */
var DEFAULT_BINDS = {
  fwd:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD',
  interact:'KeyF', reload:'KeyR', sprint:'ShiftLeft', jump:'Space',
  crouch:'ControlLeft', melee:'KeyV', swap:'KeyQ', score:'Tab',
  wpn1:'Digit1', wpn2:'Digit2', ks1:'Digit3', ks2:'Digit4', ks3:'Digit5'
};
var BIND_LABELS = {
  fwd:'Move Forward', back:'Move Back', left:'Strafe Left', right:'Strafe Right',
  interact:'Interact / Pick Up', reload:'Reload', sprint:'Sprint', jump:'Jump',
  crouch:'Crouch', melee:'Melee', swap:'Swap Weapon', score:'Scoreboard',
  wpn1:'Primary Weapon', wpn2:'Secondary Weapon',
  ks1:'Killstreak 1 (UAV)', ks2:'Killstreak 2 (Hunter)', ks3:'Killstreak 3 (Lodestar)'
};
/* Touch device? Phones and tablets get lower default resolution, on-screen
   controls, and no pointer lock. */
var IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
var IS_SMALL = Math.min(screen.width, screen.height) < 820;
var MOBILE = IS_TOUCH && IS_SMALL;

var S = {
  binds: {}, sens: 1.0, adsSens: 0.55, fov: MOBILE?80:75, res: MOBILE?0.42:0.62,
  invertY: 0, adsHold: 0, sfx: 0.8, shake: 1, autoSprint: 0,
  touchSens: 1.0, touchAutoFire: 1, leftHanded: 0,
  bloom: MOBILE?0:0.42, grain: 1, flare: 1
};
(function loadSettings(){
  for(var k in DEFAULT_BINDS) S.binds[k]=DEFAULT_BINDS[k];
  try{
    var raw = localStorage.getItem('boa_settings');
    if(raw){ var o=JSON.parse(raw);
      for(var k2 in o){ if(k2==='binds'){ for(var b in o.binds) if(DEFAULT_BINDS[b]) S.binds[b]=o.binds[b]; }
        else if(k2 in S) S[k2]=o[k2]; } }
  }catch(e){}
})();
function saveSettings(){ try{ localStorage.setItem('boa_settings', JSON.stringify(S)); }catch(e){} }
function keyLabel(code){
  if(!code) return '--';
  if(code.indexOf('Key')===0) return code.slice(3);
  if(code.indexOf('Digit')===0) return code.slice(5);
  if(code.indexOf('Arrow')===0) return code.slice(5).toUpperCase();
  var m={Space:'SPACE',ShiftLeft:'L SHIFT',ShiftRight:'R SHIFT',ControlLeft:'L CTRL',
    ControlRight:'R CTRL',AltLeft:'L ALT',AltRight:'R ALT',Tab:'TAB',CapsLock:'CAPS',
    Enter:'ENTER',Backspace:'BKSP',Escape:'ESC'};
  return m[code]||code.toUpperCase();
}

/* ============================================================================
   3. PROCEDURAL TEXTURE FACTORY
   ============================================================================ */
function TEX(w,h,fn){
  var c=document.createElement('canvas'); c.width=w; c.height=h;
  var g=c.getContext('2d'); fn(g,w,h);
  var img=g.getImageData(0,0,w,h);
  return { w:w, h:h, px:new Uint32Array(img.data.buffer), canvas:c };
}
function noise(g,w,h,amt,alpha){
  var img=g.getImageData(0,0,w,h), d=img.data;
  for(var i=0;i<d.length;i+=4){
    var n=(rnd()-0.5)*amt;
    d[i]=clamp(d[i]+n,0,255); d[i+1]=clamp(d[i+1]+n,0,255); d[i+2]=clamp(d[i+2]+n,0,255);
  }
  g.putImageData(img,0,0);
  if(alpha){ g.globalAlpha=alpha; }
}
function grain(g,w,h,n,col){
  for(var i=0;i<n;i++){ g.fillStyle=col; g.globalAlpha=rnd()*0.14;
    g.fillRect(rnd()*w,rnd()*h,rnd()*3+1,rnd()*3+1); }
  g.globalAlpha=1;
}

var TS=64; // wall texture size
var WALLTEX=[], FLOORTEX=[];

function buildTextures(){
  /* -- 1 : white concrete architectural panel --------------------------- */
  WALLTEX[1]=TEX(TS,TS,function(g,w,h){
    var gr=g.createLinearGradient(0,0,0,h);
    gr.addColorStop(0,'#f2f3f0'); gr.addColorStop(.55,'#e2e5e1'); gr.addColorStop(1,'#c3c8c4');
    g.fillStyle=gr; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(120,130,128,.45)'; g.lineWidth=1;
    for(var y=0;y<=h;y+=16){ g.beginPath(); g.moveTo(0,y+.5); g.lineTo(w,y+.5); g.stroke(); }
    g.beginPath(); g.moveTo(w-.5,0); g.lineTo(w-.5,h); g.stroke();
    g.fillStyle='rgba(255,255,255,.5)';
    for(var y2=0;y2<h;y2+=16) g.fillRect(0,y2+1,w,1);
    g.fillStyle='rgba(90,100,100,.14)'; g.fillRect(0,h-8,w,8);
    grain(g,w,h,140,'#8a9490'); noise(g,w,h,10);
  });
  /* -- 2 : blue glass curtain wall -------------------------------------- */
  WALLTEX[2]=TEX(TS,TS,function(g,w,h){
    g.fillStyle='#26424f'; g.fillRect(0,0,w,h);
    for(var y=0;y<h;y+=32) for(var x=0;x<w;x+=32){
      var gr=g.createLinearGradient(x,y,x+32,y+32);
      gr.addColorStop(0,'#6fb6d6'); gr.addColorStop(.45,'#31708c'); gr.addColorStop(.7,'#9fd8ef');
      gr.addColorStop(1,'#1d4a5e');
      g.fillStyle=gr; g.fillRect(x+2,y+2,28,28);
      g.fillStyle='rgba(255,255,255,.30)'; g.beginPath();
      g.moveTo(x+4,y+26); g.lineTo(x+16,y+3); g.lineTo(x+21,y+3); g.lineTo(x+9,y+26); g.closePath(); g.fill();
      g.fillStyle='rgba(255,255,255,.14)'; g.fillRect(x+2,y+2,28,4);
    }
    g.strokeStyle='#8d9aa2'; g.lineWidth=2;
    for(var y2=0;y2<=h;y2+=32){ g.beginPath(); g.moveTo(0,y2); g.lineTo(w,y2); g.stroke(); }
    for(var x2=0;x2<=w;x2+=32){ g.beginPath(); g.moveTo(x2,0); g.lineTo(x2,h); g.stroke(); }
    noise(g,w,h,7);
  });
  /* -- 3 : dark brushed metal ------------------------------------------- */
  WALLTEX[3]=TEX(TS,TS,function(g,w,h){
    var gr=g.createLinearGradient(0,0,0,h);
    gr.addColorStop(0,'#565f68'); gr.addColorStop(.5,'#39424b'); gr.addColorStop(1,'#252c33');
    g.fillStyle=gr; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(0,0,0,.5)';
    for(var y=6;y<h;y+=12){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); }
    g.strokeStyle='rgba(255,255,255,.13)';
    for(var y2=7;y2<h;y2+=12){ g.beginPath(); g.moveTo(0,y2); g.lineTo(w,y2); g.stroke(); }
    g.fillStyle='#748088';
    for(var i=0;i<8;i++){ var rx=4+ (i%4)*18, ry=8+floor(i/4)*40;
      g.beginPath(); g.arc(rx,ry,2,0,TAU); g.fill(); }
    grain(g,w,h,90,'#000'); noise(g,w,h,9);
  });
  /* -- 4 : supply crate -------------------------------------------------- */
  WALLTEX[4]=TEX(TS,TS,function(g,w,h){
    g.fillStyle='#a9803f'; g.fillRect(0,0,w,h);
    for(var y=0;y<h;y+=13){ g.fillStyle=(y/13)%2?'#b98d47':'#9d7538'; g.fillRect(0,y,w,12);
      g.fillStyle='rgba(0,0,0,.28)'; g.fillRect(0,y+12,w,1); }
    g.fillStyle='#4b5157'; g.fillRect(0,0,6,h); g.fillRect(w-6,0,6,h);
    g.fillStyle='rgba(255,255,255,.14)'; g.fillRect(1,0,1,h); g.fillRect(w-6,0,1,h);
    g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=3;
    g.beginPath(); g.moveTo(10,10); g.lineTo(w-10,h-10); g.moveTo(w-10,10); g.lineTo(10,h-10); g.stroke();
    grain(g,w,h,120,'#4a3410'); noise(g,w,h,12);
  });
  /* -- 5 : red hazard / signage panel ------------------------------------ */
  WALLTEX[5]=TEX(TS,TS,function(g,w,h){
    g.fillStyle='#8f2418'; g.fillRect(0,0,w,h);
    g.fillStyle='#b32d1d'; g.fillRect(0,10,w,44);
    g.fillStyle='rgba(255,255,255,.85)'; g.fillRect(0,4,w,3); g.fillRect(0,h-7,w,3);
    g.save(); g.translate(w/2,h/2); g.rotate(-0.06);
    g.fillStyle='rgba(255,255,255,.9)'; g.font='bold 19px Arial'; g.textAlign='center';
    g.fillText('RAID',0,7); g.restore();
    grain(g,w,h,110,'#3a0d06'); noise(g,w,h,10);
  });
  /* -- 6 : hedge / planter ---------------------------------------------- */
  WALLTEX[6]=TEX(TS,TS,function(g,w,h){
    g.fillStyle='#2f5c2a'; g.fillRect(0,0,w,h);
    for(var i=0;i<620;i++){
      var l=rr(.35,1);
      g.fillStyle='rgb('+floor(38*l+18)+','+floor(120*l+22)+','+floor(40*l+14)+')';
      g.beginPath(); g.ellipse(rnd()*w,rnd()*h,rr(1.5,4),rr(1,3),rnd()*PI,0,TAU); g.fill();
    }
    g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h-6,w,6);
    g.fillStyle='#b9b3a6'; g.fillRect(0,h-6,w,3);
  });
  /* -- 7 : yellow-black stripe / trim ------------------------------------ */
  WALLTEX[7]=TEX(TS,TS,function(g,w,h){
    g.fillStyle='#dcdcd6'; g.fillRect(0,0,w,h);
    g.fillStyle='#101418'; g.fillRect(0,0,w,12); g.fillRect(0,h-12,w,12);
    g.save(); g.beginPath(); g.rect(0,22,w,20); g.clip();
    for(var i=-2;i<10;i++){ g.fillStyle=i%2?'#111':'#f0b91d';
      g.save(); g.translate(i*10,22); g.transform(1,0,-.6,1,0,0); g.fillRect(0,0,10,20); g.restore(); }
    g.restore();
    grain(g,w,h,80,'#555'); noise(g,w,h,8);
  });

  /* ---------------- FLOORS (also used for the map's ground plane) ------- */
  FLOORTEX[0]=TEX(TS,TS,function(g,w,h){ // pale concrete pavers
    g.fillStyle='#cfd2ce'; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(120,126,124,.55)'; g.lineWidth=1;
    g.strokeRect(.5,.5,w-1,h-1); g.beginPath(); g.moveTo(0,32.5); g.lineTo(w,32.5);
    g.moveTo(32.5,0); g.lineTo(32.5,h); g.stroke();
    g.fillStyle='rgba(255,255,255,.4)'; g.fillRect(1,1,w-2,2);
    grain(g,w,h,180,'#8f958f'); noise(g,w,h,11);
  });
  FLOORTEX[1]=TEX(TS,TS,function(g,w,h){ // asphalt drive, sun-bleached
    g.fillStyle='#7e838a'; g.fillRect(0,0,w,h);
    grain(g,w,h,700,'#5b6066'); grain(g,w,h,400,'#a7adb3'); noise(g,w,h,16);
  });
  FLOORTEX[2]=TEX(TS,TS,function(g,w,h){ // manicured grass
    g.fillStyle='#4f7a35'; g.fillRect(0,0,w,h);
    for(var i=0;i<900;i++){ var l=rr(.6,1.25);
      g.strokeStyle='rgb('+floor(60*l)+','+floor(115*l)+','+floor(45*l)+')';
      g.lineWidth=1; g.beginPath(); var x=rnd()*w,y=rnd()*h;
      g.moveTo(x,y); g.lineTo(x+rr(-1.5,1.5),y-rr(1,4)); g.stroke(); }
  });
  FLOORTEX[3]=TEX(TS,TS,function(g,w,h){ // polished interior tile
    g.fillStyle='#e6e2d8'; g.fillRect(0,0,w,h);
    g.fillStyle='#d3cec2'; g.fillRect(0,0,32,32); g.fillRect(32,32,32,32);
    g.strokeStyle='rgba(150,145,132,.6)'; g.lineWidth=1; g.strokeRect(.5,.5,w-1,h-1);
    g.beginPath(); g.moveTo(0,32.5); g.lineTo(w,32.5); g.moveTo(32.5,0); g.lineTo(32.5,h); g.stroke();
    g.fillStyle='rgba(255,255,255,.35)'; g.fillRect(0,0,w,8);
    noise(g,w,h,7);
  });
  FLOORTEX[4]=TEX(TS,TS,function(g,w,h){ // sand / dirt path
    g.fillStyle='#c4ac82'; g.fillRect(0,0,w,h);
    grain(g,w,h,800,'#9c8560'); grain(g,w,h,300,'#e0cda6'); noise(g,w,h,14);
  });
}

/* ============================================================================
   4. SKY  (panoramic strip sampled by yaw)
   ============================================================================ */
var SKY, SKYW=1024, SKYH=320;
function buildSky(){
  SKY=TEX(SKYW,SKYH,function(g,w,h){
    var gr=g.createLinearGradient(0,0,0,h);
    gr.addColorStop(0,'#1f6fbe'); gr.addColorStop(.42,'#63aee2');
    gr.addColorStop(.78,'#b9dcf1'); gr.addColorStop(1,'#e6eef2');
    g.fillStyle=gr; g.fillRect(0,0,w,h);
    // sun + bloom
    var sx=300, sy=70;
    var sg=g.createRadialGradient(sx,sy,0,sx,sy,190);
    sg.addColorStop(0,'rgba(255,252,235,1)'); sg.addColorStop(.09,'rgba(255,244,205,.95)');
    sg.addColorStop(.35,'rgba(255,228,168,.28)'); sg.addColorStop(1,'rgba(255,220,160,0)');
    g.fillStyle=sg; g.fillRect(0,0,w,h);
    // layered cumulus: dark base, lit crown, sun-side rim
    for(var i=0;i<30;i++){
      var cx=rnd()*w, cy=rr(24,178), s=rr(.55,1.9);
      var puffs=ri(7,12), pts=[];
      for(var p=0;p<puffs;p++)
        pts.push([cx+rr(-78,78)*s, cy+rr(-11,15)*s, rr(20,52)*s, rr(11,24)*s]);
      g.fillStyle='rgba(176,196,214,.34)';
      for(var p2=0;p2<pts.length;p2++){
        g.beginPath(); g.ellipse(pts[p2][0],pts[p2][1]+7*s,pts[p2][2],pts[p2][3],0,0,TAU); g.fill(); }
      g.fillStyle='rgba(255,255,255,.62)';
      for(var p3=0;p3<pts.length;p3++){
        g.beginPath(); g.ellipse(pts[p3][0],pts[p3][1],pts[p3][2]*.94,pts[p3][3]*.88,0,0,TAU); g.fill(); }
      g.fillStyle='rgba(255,248,226,.5)';
      for(var p4=0;p4<pts.length;p4++){
        g.beginPath(); g.ellipse(pts[p4][0]-pts[p4][2]*.16,pts[p4][1]-pts[p4][3]*.34,
          pts[p4][2]*.55,pts[p4][3]*.45,0,0,TAU); g.fill(); }
    }
    // high cirrus streaks
    g.save(); g.globalAlpha=.20;
    for(var ci=0;ci<26;ci++){
      g.fillStyle='#fff';
      g.beginPath(); g.ellipse(rnd()*w, rr(8,70), rr(60,190), rr(1.5,4.5), rr(-.06,.06),0,TAU); g.fill();
    }
    g.restore();
    // crisp distant skyline: two parallax bands of towers
    function skyline(baseY,scale,col,detail){
      var x=0;
      while(x<w){
        var bw=rr(16,54)*scale, bh=rr(20,86)*scale;
        g.fillStyle=col;
        g.fillRect(x,baseY-bh,bw,bh);
        if(detail){
          g.fillStyle='rgba(255,255,255,.10)';
          for(var wy=baseY-bh+5; wy<baseY-4; wy+=7)
            for(var wx=x+3; wx<x+bw-3; wx+=6) if(rnd()<.5) g.fillRect(wx,wy,2.5,3);
          g.fillStyle=col;
        }
        if(rnd()<.28){ g.fillRect(x+bw*0.4, baseY-bh-rr(6,22)*scale, 2.5*scale, rr(6,22)*scale); }
        x+=bw+rr(1,7)*scale;
      }
    }
    skyline(h-16, 1.25, 'rgba(150,172,192,.55)', false);
    skyline(h-6,  0.95, 'rgba(118,142,166,.72)', true);
    // ridge line of trees / low structures right at the horizon
    g.fillStyle='rgba(96,118,132,.55)';
    for(var t2=0;t2<w;t2+=3){
      var th=4+3*sin(t2*0.09)+2.5*sin(t2*0.31+1.1)+rnd()*2;
      g.fillRect(t2,h-th-2,3,th+2);
    }
    // gentle horizon haze -- much lighter than before so distance stays legible
    var hz=g.createLinearGradient(0,h-54,0,h);
    hz.addColorStop(0,'rgba(214,229,241,0)'); hz.addColorStop(1,'rgba(214,229,241,.72)');
    g.fillStyle=hz; g.fillRect(0,h-54,w,54);
  });
}

/* ============================================================================
   5. MAP  --  "RAID" style symmetrical arena
   ============================================================================ */
var MW=56, MH=44;
var MAP=null, FLR=null, LIGHT=null;
function idx(x,y){ return y*MW+x; }

function buildMap(){
  MAP=new Uint8Array(MW*MH); FLR=new Uint8Array(MW*MH); LIGHT=new Float32Array(MW*MH);

  function W(x0,y0,x1,y1,v){
    for(var y=max(0,y0);y<=min(MH-1,y1);y++) for(var x=max(0,x0);x<=min(MW-1,x1);x++) MAP[idx(x,y)]=v; }
  function F(x0,y0,x1,y1,v){
    for(var y=max(0,y0);y<=min(MH-1,y1);y++) for(var x=max(0,x0);x<=min(MW-1,x1);x++) FLR[idx(x,y)]=v; }
  function BOX(x0,y0,x1,y1,v){
    W(x0,y0,x1,y0,v); W(x0,y1,x1,y1,v); W(x0,y0,x0,y1,v); W(x1,y0,x1,y1,v); }

  // ---- ground -------------------------------------------------------------
  F(0,0,MW-1,MH-1,0);
  F(25,1,30,MH-2,1);                 // central asphalt drive
  F(19,6,22,13,2); F(19,30,22,37,2); // grass verges (west)
  F(33,6,36,13,2); F(33,30,36,37,2); // grass verges (east)
  F(1,1,2,MH-2,4); F(MW-3,1,MW-2,MH-2,4); // flank dirt alleys

  // ---- outer boundary -----------------------------------------------------
  W(0,0,MW-1,0,1); W(0,MH-1,MW-1,MH-1,1); W(0,0,0,MH-1,1); W(MW-1,0,MW-1,MH-1,1);
  W(10,0,14,0,7); W(41,0,45,0,7); W(10,MH-1,14,MH-1,7); W(41,MH-1,45,MH-1,7);

  // ---- WEST buildings (mirrored to the east afterwards) -------------------
  // North-west block
  BOX(4,4,18,16,1);
  W(18,6,18,9,2); W(18,11,18,14,2);        // glass curtain wall facing plaza
  W(6,4,9,4,2);   W(13,4,16,4,2);          // clerestory windows on the north face
  W(11,5,11,15,1);                          // interior partition
  W(11,9,11,10,0);                          // partition doorway
  W(4,10,4,12,0);                           // rear door to the flank alley
  W(18,10,18,10,0);                         // plaza-side doorway
  W(12,16,15,16,0);                         // south doorway
  F(5,5,17,15,3);
  W(7,7,8,8,4); W(14,12,15,13,4);           // interior cover crates

  // South-west block
  BOX(4,27,18,39,1);
  W(18,29,18,32,2); W(18,34,18,37,2);
  W(6,39,9,39,2);  W(13,39,16,39,2);
  W(11,28,11,38,1); W(11,33,11,34,0);
  W(4,31,4,33,0);
  W(18,33,18,33,0);
  W(12,27,15,27,0);
  F(5,28,17,38,3);
  W(7,35,8,36,4); W(14,30,15,31,4);

  // West mid connector shed + cover
  BOX(6,19,13,24,3);
  W(13,21,13,22,0); W(6,21,6,22,0); W(9,19,10,19,0);
  F(7,20,12,23,3);
  W(16,19,17,20,4); W(16,23,17,24,4);

  // ---- mirror the west half onto the east half ---------------------------
  for(var y=0;y<MH;y++) for(var x=0;x<MW/2;x++){
    MAP[idx(MW-1-x,y)]=MAP[idx(x,y)];
    FLR[idx(MW-1-x,y)]=FLR[idx(x,y)];
  }

  // ---- CENTRE structure (Raid's courtyard pavilion) ----------------------
  BOX(24,18,31,25,1);
  W(26,18,29,18,2); W(26,25,29,25,2);
  W(24,20,24,23,2); W(31,20,31,23,2);
  W(27,18,28,18,0); W(27,25,28,25,0);       // N / S doorways
  W(24,21,24,22,0); W(31,21,31,22,0);       // W / E doorways
  F(25,19,30,24,3);
  W(26,21,26,22,4); W(29,21,29,22,4);

  // ---- plaza cover, planters, signage ------------------------------------
  W(22,8,23,9,4);  W(32,8,33,9,4);
  W(22,34,23,35,4); W(32,34,33,35,4);
  W(20,7,21,12,6); W(35,7,34,12,6);
  W(20,31,21,36,6); W(35,31,34,36,6);
  W(26,4,29,4,5);  W(26,39,29,39,5);        // hazard signage walls
  W(19,20,19,23,3); W(37,20,37,23,3);
  W(24,13,25,13,4); W(30,13,31,13,4);
  W(24,30,25,30,4); W(30,30,31,30,4);
  W(8,21,11,22,0);                          // keep shed interior clear

  // ---- ambient light bake (cheap fake AO / sun bounce) -------------------
  for(var y2=0;y2<MH;y2++) for(var x2=0;x2<MW;x2++){
    var i=idx(x2,y2), open=0;
    for(var dy=-2;dy<=2;dy++) for(var dx=-2;dx<=2;dx++){
      var nx=x2+dx, ny=y2+dy;
      if(nx<0||ny<0||nx>=MW||ny>=MH) continue;
      if(!MAP[idx(nx,ny)]) open++;
    }
    LIGHT[i]=0.62+0.38*(open/25);
  }
}
function solid(x,y){
  if(x<0||y<0||x>=MW||y>=MH) return 1;
  return MAP[idx(x|0,y|0)];
}
function solidAt(px,py){ return solid(px|0,py|0); }
