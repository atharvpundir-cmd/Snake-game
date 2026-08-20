
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
  // Characters used to be 48 pre-rendered billboard frames (8 angles x 2 teams
  // x 3 poses). They are real voxel geometry now -- see drawVoxelActor -- so
  // that atlas is no longer baked.
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
