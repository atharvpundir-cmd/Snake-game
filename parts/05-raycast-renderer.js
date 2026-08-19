/* ============================================================================
   15. RENDER TARGET / CAMERA
   ============================================================================ */
var RC=document.createElement('canvas'), RCTX=RC.getContext('2d',{alpha:false});
var IMG=null, BUF=null, DEPTH=null, RW=0, RH=0, VW=0, VH=0;
var CAM={x:0,y:0,ang:0,pitch:0,eye:0.56,tanHalf:0.75,proj:1,horizon:0,
         dirX:1,dirY:0,planeX:0,planeY:1};
var SHAKE={x:0,y:0,m:0,r:0};
var FOG_R=226, FOG_G=238, FOG_B=244;
var FOGC=(255<<24)|(244<<16)|(238<<8)|226;
var SUNX=0.55, SUNY=-0.84;

function shakeAdd(v){ SHAKE.m=min(1.4, SHAKE.m+v*S.shake); }

function resizeRender(){
  VW=window.innerWidth; VH=window.innerHeight;
  view.width=VW; view.height=VH; fx.width=VW; fx.height=VH;
  var sc=S.res;
  var w=max(240,floor(VW*sc)), h=max(150,floor(VH*sc));
  var budget=430000;
  if(w*h>budget){ var k=sqrt(budget/(w*h)); w=floor(w*k); h=floor(h*k); }
  RW=w; RH=h; RC.width=RW; RC.height=RH;
  IMG=RCTX.createImageData(RW,RH);
  BUF=new Uint32Array(IMG.data.buffer);
  DEPTH=new Float32Array(RW*RH);
  vctx.imageSmoothingEnabled=true;
  fctx.imageSmoothingEnabled=true;
}
window.addEventListener('resize',function(){ resizeRender(); });

function initRenderExtras(){
  SPR.hole=TEX(24,24,function(g,w,h){
    var gr=g.createRadialGradient(12,12,0,12,12,11);
    gr.addColorStop(0,'rgba(10,10,12,.95)'); gr.addColorStop(.45,'rgba(30,30,34,.8)');
    gr.addColorStop(.75,'rgba(150,150,150,.35)'); gr.addColorStop(1,'rgba(180,180,180,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(12,12,11,0,TAU); g.fill();
    g.fillStyle='rgba(0,0,0,.9)'; g.beginPath(); g.arc(12,12,3.6,0,TAU); g.fill();
  });
}

/* wall heights per tile code */
var WALLH=[0, 2.30, 2.30, 1.55, 0.86, 1.45, 0.82, 1.35];

/* ============================================================================
   16. WORLD RENDER  (sky -> floor -> walls -> sprites, into a pixel buffer)
   ============================================================================ */
function render3D(){
  var fovDeg = S.fov;
  var w=W();
  var zoom = lerp(1, w.def.zoom, easeAds(P.ads));
  var fov = fovDeg*PI/180*zoom;
  var tanHalf=Math.tan(fov*0.5);
  var proj=(RW*0.5)/tanHalf;
  var eye = P.eye + P.z;
  var pitchPix = Math.tan(clamp(P.pitch,-0.92,0.92))*proj;
  var horizon = RH*0.5 + pitchPix + SHAKE.y*RH*0.04 + P.bob*RH*0.010;

  CAM.x=P.x; CAM.y=P.y; CAM.ang=P.ang+SHAKE.x*0.03; CAM.pitch=P.pitch;
  CAM.eye=eye; CAM.tanHalf=tanHalf; CAM.proj=proj; CAM.horizon=horizon;
  CAM.dirX=cos(CAM.ang); CAM.dirY=sin(CAM.ang);
  CAM.planeX=-CAM.dirY*tanHalf; CAM.planeY=CAM.dirX*tanHalf;

  var dirX=CAM.dirX, dirY=CAM.dirY, planeX=CAM.planeX, planeY=CAM.planeY;
  var px=P.x, py=P.y;
  var buf=BUF, dep=DEPTH;
  var hor=horizon|0;

  // Prefill: guarantees every pixel is defined even if a pass skips a row
  // (fractional horizon, extreme pitch, rays leaving the map). Two typed-array
  // fills cost far less than hunting a stray unpainted scanline.
  buf.fill(FOGC); dep.fill(1e9);

  /* ---------------- SKY ---------------------------------------------- */
  var skyPx=SKY.px, skyScale=SKYH/(RH*0.92);
  // ceil() so the row straddling the horizon is always painted: the floor pass
  // skips rows whose p < 0.6, which would otherwise leave a bare scanline
  var yTop=0, yBot=min(RH-1, Math.ceil(horizon));
  for(var x=0;x<RW;x++){
    var camX=2*x/RW-1;
    var rdx=dirX+planeX*camX, rdy=dirY+planeY*camX;
    var a=atan2(rdy,rdx)/TAU; a-=floor(a);
    var su=(a*SKYW)|0; if(su<0)su=0; if(su>=SKYW)su=SKYW-1;
    for(var y=yTop;y<=yBot;y++){
      var v=SKYH-1-(horizon-y)*skyScale;
      if(v<0)v=0; else if(v>SKYH-1)v=SKYH-1;
      var i=y*RW+x;
      buf[i]=skyPx[(v|0)*SKYW+su];
      dep[i]=1e9;
    }
  }
  if(hor<0){ /* looking far down: sky not visible */ }

  /* ---------------- FLOOR --------------------------------------------- */
  var rx0=dirX-planeX, ry0=dirY-planeY, rx1=dirX+planeX, ry1=dirY+planeY;
  var fogStart=9, fogSpan=1/34;
  for(var y2=max(0,hor+1); y2<RH; y2++){
    var p=y2-horizon; if(p<0.6) continue;
    var rowD=eye*proj/p;
    if(rowD>62){ // beyond the fog wall -> flat haze
      var iRow=y2*RW;
      for(var xf=0;xf<RW;xf++){ buf[iRow+xf]=FOGC; dep[iRow+xf]=rowD; }
      continue;
    }
    var stepX=rowD*(rx1-rx0)/RW, stepY=rowD*(ry1-ry0)/RW;
    var fX=px+rowD*rx0, fY=py+rowD*ry0;
    var fog=clamp((rowD-fogStart)*fogSpan,0,1); fog*=fog*0.92;
    var fr=FOG_R*fog, fg=FOG_G*fog, fb=FOG_B*fog, base=(1-fog);
    var row=y2*RW;
    for(var x2=0;x2<RW;x2++){
      // floor() not |0: for coords in (-1,0) truncation would pass the bounds
      // check and then index the texture negatively
      var cx=floor(fX), cy=floor(fY), o=row+x2;
      if(cx>=0&&cy>=0&&cx<MW&&cy<MH){
        var ti=idx(cx,cy);
        var t=FLOORTEX[FLR[ti]]||FLOORTEX[0];
        var tx=((fX-cx)*TS)|0, ty=((fY-cy)*TS)|0;
        var c=t.px[ty*TS+tx];
        var sh=base*LIGHT[ti];
        buf[o]=(255<<24)|
          ((((c>>16&255)*sh+fb)|0)<<16)|
          ((((c>>8&255)*sh+fg)|0)<<8)|
          (((c&255)*sh+fr)|0);
      } else {
        buf[o]=FOGC;               // ground outside the arena -> horizon haze
      }
      dep[o]=rowD;
      fX+=stepX; fY+=stepY;
    }
  }

  /* ---------------- WALLS (multi-hit, back to front) ------------------- */
  var hitsD=new Float64Array(8), hitsT=new Int32Array(8), hitsS=new Int32Array(8),
      hitsW=new Float64Array(8), hitsN=new Int32Array(8), hitsI=new Int32Array(8);
  for(var col=0;col<RW;col++){
    var camX2=2*col/RW-1;
    var rdx2=dirX+planeX*camX2, rdy2=dirY+planeY*camX2;
    var mapX=px|0, mapY=py|0;
    var ddX=rdx2===0?1e30:abs(1/rdx2), ddY=rdy2===0?1e30:abs(1/rdy2);
    var stX,stY,sdX,sdY;
    if(rdx2<0){ stX=-1; sdX=(px-mapX)*ddX; } else { stX=1; sdX=(mapX+1-px)*ddX; }
    if(rdy2<0){ stY=-1; sdY=(py-mapY)*ddY; } else { stY=1; sdY=(mapY+1-py)*ddY; }
    var nHit=0, side=0, guard=0, perp=0;
    while(guard++<220 && nHit<8){
      if(sdX<sdY){ sdX+=ddX; mapX+=stX; side=0; } else { sdY+=ddY; mapY+=stY; side=1; }
      if(mapX<0||mapY<0||mapX>=MW||mapY>=MH) break;
      perp = side===0 ? sdX-ddX : sdY-ddY;
      if(perp>60) break;
      var tcode=MAP[idx(mapX,mapY)];
      if(!tcode) continue;
      var wx;
      if(side===0) wx=py+perp*rdy2; else wx=px+perp*rdx2;
      wx-=floor(wx);
      if((side===0&&rdx2>0)||(side===1&&rdy2<0)) wx=1-wx;
      hitsD[nHit]=perp; hitsT[nHit]=tcode; hitsS[nHit]=side; hitsW[nHit]=wx;
      hitsN[nHit]=(side===0?-stX:-stY); hitsI[nHit]=idx(mapX,mapY);
      nHit++;
      if(WALLH[tcode]>=1.5) break;   // opaque full-height wall: stop
    }
    for(var k=nHit-1;k>=0;k--){
      var d=hitsD[k]; if(d<0.02) d=0.02;
      var code=hitsT[k], hgt=WALLH[code]||1;
      var tex=WALLTEX[code]||WALLTEX[1];
      var yb=horizon+(eye)*proj/d;
      var yt=horizon+(eye-hgt)*proj/d;
      var y0=yt|0, y1=yb|0;
      if(y1<0||y0>=RH) continue;
      var rep=hgt>1.6?2:1;
      var texX=(hitsW[k]*TS)|0; if(texX<0)texX=0; if(texX>=TS)texX=TS-1;
      // shading: face orientation + sun + baked light + fog
      var sd=hitsS[k];
      var nx = sd===0?hitsN[k]:0, ny = sd===1?hitsN[k]:0;
      var sun = max(0, nx*SUNX+ny*SUNY);
      var sh = ((sd===0?1.0:0.86) + sun*0.22) * (0.72+0.28*LIGHT[hitsI[k]]);
      var fog2=clamp((d-fogStart)*fogSpan,0,1); fog2*=fog2*0.92;
      var a2=sh*(1-fog2);
      var fr2=FOG_R*fog2, fg2=FOG_G*fog2, fb2=FOG_B*fog2;
      var yA=y0<0?0:y0, yB=y1>=RH?RH-1:y1;
      var invH=1/(yb-yt);
      var col32=tex.px;
      // hits are drawn far -> near, so nearer walls simply overwrite; testing
      // against the floor's depth here would punch floor-coloured specks
      // through wall bases where rowDistance ~= perpWallDist.
      for(var y3=yA;y3<=yB;y3++){
        var o2=y3*RW+col;
        var f=(yb-y3)*invH;                 // 0 at top .. 1 at bottom
        var vv=((1-f)*rep)%1;
        var ty2=(vv*TS)|0; if(ty2<0)ty2=0; else if(ty2>=TS)ty2=TS-1;
        var c2=col32[ty2*TS+texX];
        buf[o2]=(255<<24)|
          ((((c2>>16&255)*a2+fb2)|0)<<16)|
          ((((c2>>8&255)*a2+fg2)|0)<<8)|
          (((c2&255)*a2+fr2)|0);
        dep[o2]=d;
      }
    }
  }

  /* ---------------- SPRITES -------------------------------------------- */
  var list=[];
  for(var bi=0;bi<BOTS.length;bi++){
    var b=BOTS[bi];
    if(b.alive){
      var va=atan2(py-b.y, px-b.x);
      var relA=b.ang-va;
      var ai=Math.round(relA/TAU*8)%8; if(ai<0) ai+=8;
      var pose = b.walkPhase||0;
      list.push({t:SOLDIER[b.team][ai][pose], x:b.x, y:b.y, z:0,
        w:0.80, h:1.16*(b.crouching?0.7:1), a:1, add:0});
    } else if(b.deadT<4){
      var sink=clamp(b.deadT*0.35,0,0.2);
      list.push({t:SOLDIER[b.team].dead, x:b.x, y:b.y, z:0.02,
        w:1.05, h:0.55, a:clamp(1-(b.deadT-2.6)/1.4,0,1), add:0});
    }
  }
  for(var pi=0;pi<PICKUPS.length;pi++){
    var pk=PICKUPS[pi];
    list.push({t:SPR.pickup, x:pk.x, y:pk.y, z:0.10+sin(G.t*2.4+pk.bob)*0.045,
      w:0.62, h:0.34, a:pk.life<4?(0.35+0.65*abs(sin(G.t*7))):1, add:0});
  }
  for(var fi=0;fi<FXS.length;fi++){
    var f=FXS[fi];
    var lf=f.life/f.max;
    list.push({t:f.spr, x:f.x, y:f.y, z:f.z, w:f.size, h:f.size,
      a:f.a0*(f.fade?lf:1), add:f.add});
  }
  for(var di=0;di<DECALS.length;di++){
    var dc=DECALS[di];
    list.push({t:SPR.hole, x:dc.x, y:dc.y, z:dc.z, w:dc.size, h:dc.size,
      a:clamp(dc.life/3,0,1), add:0});
  }
  // depth sort back -> front
  for(var li2=0;li2<list.length;li2++){
    var sx=list[li2].x-px, sy=list[li2].y-py;
    list[li2].d=sx*sx+sy*sy;
  }
  list.sort(function(a,b){return b.d-a.d;});
  var invDet=1/(planeX*dirY-dirX*planeY);
  for(var s2=0;s2<list.length;s2++) drawSprite(list[s2],invDet,px,py,proj,horizon,eye);

  RCTX.putImageData(IMG,0,0);
  vctx.drawImage(RC,0,0,RW,RH,0,0,VW,VH);
}

function drawSprite(s,invDet,px,py,proj,horizon,eye){
  var sx=s.x-px, sy=s.y-py;
  var dirX=CAM.dirX, dirY=CAM.dirY, planeX=CAM.planeX, planeY=CAM.planeY;
  var tX=invDet*(dirY*sx-dirX*sy);
  var tY=invDet*(-planeY*sx+planeX*sy);
  if(tY<0.12) return;
  var scrX=(RW*0.5)*(1+tX/tY);
  var hPix=s.h*proj/tY, wPix=s.w*proj/tY;
  if(wPix<0.7||hPix<0.7) return;
  var yBot=horizon+(eye-s.z)*proj/tY;
  var yTop=yBot-hPix;
  var x0=(scrX-wPix*0.5)|0, x1=(scrX+wPix*0.5)|0;
  var y0=yTop|0, y1=yBot|0;
  if(x1<0||x0>=RW||y1<0||y0>=RH) return;
  var tex=s.t, tw=tex.w, th=tex.h, tpx=tex.px;
  var stepU=tw/wPix, stepV=th/hPix;
  var xa=x0<0?0:x0, xb=x1>=RW?RW-1:x1;
  var ya=y0<0?0:y0, yb2=y1>=RH?RH-1:y1;
  var alpha=s.a, add=s.add, buf=BUF, dep=DEPTH;
  for(var x=xa;x<=xb;x++){
    var u=((x-x0)*stepU)|0; if(u<0||u>=tw) continue;
    for(var y=ya;y<=yb2;y++){
      var o=y*RW+x;
      if(dep[o]<=tY) continue;
      var v=((y-y0)*stepV)|0; if(v<0||v>=th) continue;
      var c=tpx[v*tw+u];
      var ca=(c>>>24);
      if(!ca) continue;
      var a=(ca/255)*alpha;
      if(a<=0.004) continue;
      var d0=buf[o];
      var sr=c&255, sg=c>>8&255, sb=c>>16&255;
      var dr=d0&255, dg=d0>>8&255, db=d0>>16&255;
      var nr,ng,nb;
      if(add){ nr=dr+sr*a; ng=dg+sg*a; nb=db+sb*a;
               if(nr>255)nr=255; if(ng>255)ng=255; if(nb>255)nb=255; }
      else { nr=dr+(sr-dr)*a; ng=dg+(sg-dg)*a; nb=db+(sb-db)*a; }
      buf[o]=(255<<24)|((nb|0)<<16)|((ng|0)<<8)|(nr|0);
      if(!add && a>0.6) dep[o]=tY;
    }
  }
}
function easeAds(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

/* ============================================================================
   17. OVERLAY  --  viewmodel, scope, crosshair, hit feedback
   ============================================================================ */
var VM={ sx:0, sy:0, swayX:0, swayY:0, bobX:0, bobY:0, kick:0, kickA:0,
         boltT:0, reloadT:0, flash:0, flashA:0, swapT:0 };
var HITMARK={t:0, hs:0, kill:0};

function drawOverlay(dt){
  fctx.clearRect(0,0,VW,VH);
  var w=W(), ads=easeAds(P.ads);

  /* --- weapon --- */
  if(!(w.def.scope && P.ads>0.86) && P.alive) drawViewmodel(w,ads);

  /* --- sniper scope --- */
  if(w.def.scope && P.ads>0.02) drawScope(P.ads);

  /* --- crosshair (hip / non-scoped ads) --- */
  if(P.alive && !(w.def.scope&&P.ads>0.5)) drawCrosshair(w,ads);

  /* --- hitmarker --- */
  if(HITMARK.t>0){
    var a=clamp(HITMARK.t/0.32,0,1);
    var cx=VW/2, cy=VH/2, r=9+(1-a)*5;
    fctx.save(); fctx.globalAlpha=a;
    fctx.strokeStyle=HITMARK.kill?'#ff4a33':(HITMARK.hs?'#ffd24a':'#ffffff');
    fctx.lineWidth=HITMARK.kill?3.4:2.6; fctx.lineCap='round';
    fctx.shadowColor='rgba(0,0,0,.8)'; fctx.shadowBlur=4;
    for(var i=0;i<4;i++){
      var a2=PI/4+i*PI/2;
      fctx.beginPath();
      fctx.moveTo(cx+cos(a2)*r, cy+sin(a2)*r);
      fctx.lineTo(cx+cos(a2)*(r+7), cy+sin(a2)*(r+7));
      fctx.stroke();
    }
    fctx.restore();
  }

  /* --- sprint / low health edge --- */
  if(P.alive && P.flinch>0.01){
    fctx.save();
    var g2=fctx.createRadialGradient(VW/2,VH/2,VH*0.24,VW/2,VH/2,VH*0.72);
    g2.addColorStop(0,'rgba(160,0,0,0)');
    g2.addColorStop(1,'rgba(150,0,0,'+(P.flinch*0.5).toFixed(3)+')');
    fctx.fillStyle=g2; fctx.fillRect(0,0,VW,VH); fctx.restore();
  }
  /* --- death cam tint --- */
  if(!P.alive){
    fctx.fillStyle='rgba(70,0,0,.28)'; fctx.fillRect(0,0,VW,VH);
  }
}

/* ---------------------------------------------------------------- crosshair */
function drawCrosshair(w,ads){
  var spread=currentSpread(w);
  var cx=VW/2, cy=VH/2;
  var gap=clamp(spread*VW*3.0, 4, 46)*(1-ads*0.55)+3;
  var len=7+gap*0.10;
  fctx.save();
  fctx.strokeStyle='rgba(255,255,255,.92)'; fctx.lineWidth=2;
  fctx.shadowColor='rgba(0,0,0,.9)'; fctx.shadowBlur=3;
  fctx.lineCap='butt';
  [[0,-1],[0,1],[-1,0],[1,0]].forEach(function(d){
    fctx.beginPath();
    fctx.moveTo(cx+d[0]*gap, cy+d[1]*gap);
    fctx.lineTo(cx+d[0]*(gap+len), cy+d[1]*(gap+len));
    fctx.stroke();
  });
  fctx.fillStyle='rgba(255,255,255,.85)';
  fctx.fillRect(cx-1,cy-1,2,2);
  fctx.restore();
}
function currentSpread(w){
  var d=w.def;
  var s=lerp(d.hipSpread, d.adsSpread, easeAds(P.ads));
  var mv=sqrt(P.vx*P.vx+P.vy*P.vy);
  s+= mv*0.010 + (P.sprint?0.045:0) + (P.crouching?-0.008:0);
  s+= abs(P.recoilV)*0.35;
  return max(0.0007,s);
}

/* ---------------------------------------------------------------- scope */
function drawScope(t){
  var a=easeAds(t);
  var cx=VW/2 + VM.swayX*0.28, cy=VH/2 + VM.swayY*0.28;
  var R=min(VW,VH)*0.385;
  var g=fctx;
  g.save();
  g.globalAlpha=a;
  // black surround
  g.fillStyle='#000';
  g.beginPath();
  g.rect(0,0,VW,VH);
  g.arc(cx,cy,R,0,TAU,true);
  g.fill();
  // lens tint + vignette
  var lens=g.createRadialGradient(cx-R*0.25,cy-R*0.3,R*0.05,cx,cy,R);
  lens.addColorStop(0,'rgba(180,215,235,.10)');
  lens.addColorStop(.55,'rgba(120,160,190,.05)');
  lens.addColorStop(.86,'rgba(10,20,30,.32)');
  lens.addColorStop(1,'rgba(0,0,0,.85)');
  g.beginPath(); g.arc(cx,cy,R,0,TAU); g.fillStyle=lens; g.fill();
  // outer bezel rings
  g.beginPath(); g.arc(cx,cy,R+1,0,TAU);
  g.strokeStyle='rgba(20,22,24,.95)'; g.lineWidth=14; g.stroke();
  g.beginPath(); g.arc(cx,cy,R-4,0,TAU);
  g.strokeStyle='rgba(255,255,255,.10)'; g.lineWidth=1.6; g.stroke();
  g.beginPath(); g.arc(cx,cy,R*0.965,0,TAU);
  g.strokeStyle='rgba(90,120,140,.22)'; g.lineWidth=3; g.stroke();
  // glass streak
  g.save(); g.beginPath(); g.arc(cx,cy,R-3,0,TAU); g.clip();
  var st=g.createLinearGradient(cx-R,cy-R,cx+R*0.2,cy+R);
  st.addColorStop(0,'rgba(255,255,255,.11)');
  st.addColorStop(.35,'rgba(255,255,255,.02)');
  st.addColorStop(.6,'rgba(255,255,255,0)');
  g.fillStyle=st; g.fillRect(cx-R,cy-R,R*2,R*2);
  g.restore();
  // reticle
  g.strokeStyle='rgba(15,17,20,.95)'; g.lineWidth=1.7;
  var gap=R*0.052;
  g.beginPath();
  g.moveTo(cx-R,cy); g.lineTo(cx-gap,cy);
  g.moveTo(cx+gap,cy); g.lineTo(cx+R,cy);
  g.moveTo(cx,cy-R); g.lineTo(cx,cy-gap);
  g.moveTo(cx,cy+gap); g.lineTo(cx,cy+R);
  g.stroke();
  // thick outer posts
  g.lineWidth=4.2;
  g.beginPath();
  g.moveTo(cx-R,cy); g.lineTo(cx-R*0.58,cy);
  g.moveTo(cx+R*0.58,cy); g.lineTo(cx+R,cy);
  g.moveTo(cx,cy-R); g.lineTo(cx,cy-R*0.58);
  g.moveTo(cx,cy+R*0.58); g.lineTo(cx,cy+R);
  g.stroke();
  // mil dots
  g.fillStyle='rgba(15,17,20,.9)';
  for(var i=1;i<=4;i++){
    var d=R*0.13*i;
    g.beginPath(); g.arc(cx,cy+d,2.1,0,TAU); g.fill();
    g.beginPath(); g.arc(cx,cy-d,2.1,0,TAU); g.fill();
    g.beginPath(); g.arc(cx-d,cy,2.1,0,TAU); g.fill();
    g.beginPath(); g.arc(cx+d,cy,2.1,0,TAU); g.fill();
  }
  // centre dot
  g.fillStyle='rgba(20,20,22,.95)';
  g.beginPath(); g.arc(cx,cy,1.7,0,TAU); g.fill();
  // range ticks + numerals
  g.font='600 '+max(9,R*0.045)+'px "Segoe UI",Arial';
  g.fillStyle='rgba(20,22,25,.75)'; g.textAlign='left';
  for(var n=1;n<=3;n++){
    var yy=cy+R*0.13*n*1.0;
    g.fillText((n*2)+'00', cx+R*0.055, yy+3);
  }
  // outer scope shadow ring on the screen edge
  var vg=g.createRadialGradient(cx,cy,R,cx,cy,R*1.6);
  vg.addColorStop(0,'rgba(0,0,0,.9)'); vg.addColorStop(1,'rgba(0,0,0,1)');
  g.globalAlpha=a*0.9;
  g.beginPath(); g.rect(0,0,VW,VH); g.arc(cx,cy,R,0,TAU,true);
  g.fillStyle=vg; g.fill();
  g.restore();
}

/* ---------------------------------------------------------------- viewmodel */
function drawViewmodel(w,ads){
  var g=fctx, d=w.def;
  var s=VH/790;                                   // global art scale
  var hipX=VW*0.70, hipY=VH*1.02;
  var adsX=VW*0.5+ (d.scope?0:VW*0.005), adsY=VH*0.905;
  var bx=lerp(hipX,adsX,ads), by=lerp(hipY,adsY,ads);
  bx+=VM.swayX*(1-ads*0.7)+VM.bobX*(1-ads*0.75);
  by+=VM.swayY*(1-ads*0.7)+VM.bobY*(1-ads*0.75);
  by+=VM.kick*s*1.6;
  var rot=VM.kickA + VM.swayX*0.00035 + (P.sprint?0.30*(1-ads):0);
  var lower=(P.sprint?VH*0.10*(1-ads):0);
  // reload animation: dip + roll the weapon
  if(w.st==='reload'){
    var rt=1-w.t/d.reload;
    var curve=sin(clamp(rt,0,1)*PI);
    lower+=curve*VH*0.28;
    rot+=curve*0.62;
    bx+=curve*VW*0.035;
  }
  if(w.st==='swap'){
    var st2=clamp(w.t/0.32,0,1);
    lower+=st2*VH*0.42; rot+=st2*0.5;
  }
  g.save();
  g.translate(bx, by+lower);
  g.rotate(rot);
  g.scale(s*lerp(1,1.06,ads), s*lerp(1,1.06,ads));
  if(d.cls==='SNIPER') drawSniper(g,w,ads); else drawRifle(g,w,ads);
  g.restore();
  // muzzle flash
  if(VM.flash>0){
    var mfx=bx+cos(rot)*(d.cls==='SNIPER'?-330:-250)*s - sin(rot)*(-118*s);
    var mfy=by+lower+sin(rot)*(d.cls==='SNIPER'?-330:-250)*s + cos(rot)*(-118*s);
    var r=(d.cls==='SNIPER'?150:96)*s*VM.flashA;
    g.save(); g.globalCompositeOperation='lighter';
    var fg2=g.createRadialGradient(mfx,mfy,1,mfx,mfy,r);
    fg2.addColorStop(0,'rgba(255,255,240,'+(0.95*VM.flashA)+')');
    fg2.addColorStop(.25,'rgba(255,214,120,'+(0.7*VM.flashA)+')');
    fg2.addColorStop(.6,'rgba(255,150,40,'+(0.3*VM.flashA)+')');
    fg2.addColorStop(1,'rgba(255,120,0,0)');
    g.fillStyle=fg2; g.beginPath(); g.arc(mfx,mfy,r,0,TAU); g.fill();
    g.strokeStyle='rgba(255,240,200,'+(0.65*VM.flashA)+')'; g.lineWidth=3*s;
    for(var i=0;i<5;i++){
      var a2=rot+i*TAU/5+0.4;
      g.beginPath(); g.moveTo(mfx,mfy);
      g.lineTo(mfx+cos(a2)*r*0.95, mfy+sin(a2)*r*0.95); g.stroke();
    }
    g.restore();
  }
}
/* ---- Ballista / DSR: long bolt-action with side-mounted optic ---- */
function drawSniper(g,w,ads){
  var boltPull = VM.boltT>0 ? sin(clamp(1-VM.boltT/w.def.bolt,0,1)*PI) : 0;
  // stock
  g.fillStyle='#23282d';
  g.beginPath();
  g.moveTo(120,-40); g.lineTo(255,-30); g.lineTo(262,26); g.lineTo(140,44);
  g.closePath(); g.fill();
  g.fillStyle='#2c3238'; g.fillRect(150,-60,90,26);
  g.fillStyle='#1a1e22'; g.fillRect(96,-46,60,86);           // grip housing
  // receiver
  var rec=g.createLinearGradient(0,-56,0,20);
  rec.addColorStop(0,'#41474d'); rec.addColorStop(.5,'#2a2f34'); rec.addColorStop(1,'#171a1e');
  g.fillStyle=rec; g.fillRect(-150,-58,290,74);
  g.fillStyle='#14171a'; g.fillRect(-150,-14,290,10);
  // desert digital camo flecks
  g.save(); g.beginPath(); g.rect(-150,-58,290,74); g.clip();
  for(var i=0;i<44;i++){
    g.fillStyle=['rgba(120,108,86,.30)','rgba(80,74,60,.30)','rgba(150,140,116,.22)'][i%3];
    g.fillRect(-150+rnd()*290, -58+rnd()*74, rr(6,16), rr(4,10));
  }
  g.restore();
  // magazine
  g.fillStyle='#191d21'; g.fillRect(20,14,46,66);
  g.fillStyle='#0f1215'; g.fillRect(24,72,38,10);
  // trigger guard + hand
  g.strokeStyle='#15181c'; g.lineWidth=7;
  g.beginPath(); g.arc(96,26,20,0,PI); g.stroke();
  // barrel
  g.fillStyle='#1c2024'; g.fillRect(-340,-40,200,30);
  g.fillStyle='#262b30'; g.fillRect(-340,-40,200,8);
  // muzzle brake
  g.fillStyle='#121517'; g.fillRect(-392,-46,56,42);
  g.fillStyle='#2b3136';
  for(var b=0;b<3;b++) g.fillRect(-386+b*17,-46,7,42);
  g.fillStyle='#0b0d0f'; g.beginPath(); g.ellipse(-392,-25,7,16,0,0,TAU); g.fill();
  // bipod
  g.strokeStyle='#20252a'; g.lineWidth=8;
  g.beginPath(); g.moveTo(-250,-12); g.lineTo(-292,66); g.stroke();
  g.beginPath(); g.moveTo(-250,-12); g.lineTo(-214,70); g.stroke();
  // scope
  g.fillStyle='#101315';
  g.fillRect(-190,-104,250,34);
  g.fillStyle='#191d20'; g.fillRect(-206,-110,34,46); g.fillRect(30,-108,40,42);
  g.fillStyle='#0a0c0e'; g.beginPath(); g.ellipse(-206,-87,9,23,0,0,TAU); g.fill();
  var lensG=g.createRadialGradient(-202,-92,2,-206,-87,20);
  lensG.addColorStop(0,'rgba(150,220,255,.55)'); lensG.addColorStop(1,'rgba(20,60,90,.25)');
  g.fillStyle=lensG; g.beginPath(); g.ellipse(-206,-87,7,20,0,0,TAU); g.fill();
  // scope rings
  g.fillStyle='#23282c'; g.fillRect(-150,-112,26,52); g.fillRect(-30,-112,26,52);
  // turret
  g.fillStyle='#2b3135'; g.fillRect(-92,-124,30,22);
  // bolt handle (animates back on cycle)
  g.save(); g.translate(60+boltPull*60, -46+boltPull*8);
  g.fillStyle='#3a4147'; g.fillRect(0,-6,54,15);
  g.beginPath(); g.arc(56,1,12,0,TAU); g.fill();
  g.fillStyle='#20252a'; g.beginPath(); g.arc(56,1,6,0,TAU); g.fill();
  g.restore();
  // shooter hands
  gloveHand(g, 108, 34, 0.24);            // trigger hand
  gloveHand(g, -250, 24, -0.32);          // support hand
  // sling
  g.strokeStyle='rgba(40,44,48,.9)'; g.lineWidth=6;
  g.beginPath(); g.moveTo(-240,-6); g.quadraticCurveTo(-60,120,140,40); g.stroke();
}
/* ---- MSMC / M27 / AN-94: compact automatic ---- */
function drawRifle(g,w,ads){
  var d=w.def;
  var lmg = d.cls==='LMG';
  g.fillStyle='#22272c';
  g.beginPath(); g.moveTo(120,-36); g.lineTo(236,-26); g.lineTo(240,22); g.lineTo(136,38);
  g.closePath(); g.fill();
  g.fillStyle='#1a1e22'; g.fillRect(96,-40,54,80);
  var rec=g.createLinearGradient(0,-50,0,18);
  rec.addColorStop(0,'#3b4147'); rec.addColorStop(.5,'#262b30'); rec.addColorStop(1,'#15181b');
  g.fillStyle=rec; g.fillRect(-120,-52,250,66);
  g.fillStyle='#101315'; g.fillRect(-120,-12,250,8);
  // magazine (bigger on the LMG)
  g.fillStyle='#181c20';
  if(lmg){ g.fillRect(-10,10,86,72); g.fillStyle='#0e1113'; g.fillRect(-4,74,74,12); }
  else { g.save(); g.translate(24,12); g.rotate(0.16); g.fillRect(0,0,40,80);
         g.fillStyle='#0e1113'; g.fillRect(2,72,36,10); g.restore(); }
  // handguard + barrel
  g.fillStyle='#1d2226'; g.fillRect(-268,-44,160,32);
  g.fillStyle='#282e33';
  for(var i=0;i<6;i++) g.fillRect(-258+i*24,-40,12,6);
  g.fillStyle='#15181b'; g.fillRect(-320,-36,60,16);
  g.fillStyle='#0f1214'; g.fillRect(-336,-40,20,24);
  // suppressor for pickups that carry one
  if(d.attach==='SUPPRESSOR'){ g.fillStyle='#101314'; g.fillRect(-392,-42,72,28); }
  // foregrip
  g.fillStyle='#191d21'; g.fillRect(-214,10,26,52);
  // optic
  g.fillStyle='#12161a'; g.fillRect(-90,-84,120,30);
  g.fillStyle='#1c2126'; g.fillRect(-96,-90,22,40); g.fillRect(14,-88,24,36);
  g.fillStyle='rgba(120,200,255,.35)'; g.fillRect(-90,-80,116,10);
  g.fillStyle='#ff4a3a'; g.beginPath(); g.arc(-32,-69,3.4,0,TAU); g.fill();
  // charging handle
  g.fillStyle='#31383e'; g.fillRect(60,-58,44,10);
  gloveHand(g,110,30,0.2);
  gloveHand(g,-206,44,-0.25);
}
function gloveHand(g,x,y,rot){
  g.save(); g.translate(x,y); g.rotate(rot);
  var grd=g.createLinearGradient(0,-26,0,42);
  grd.addColorStop(0,'#3d4650'); grd.addColorStop(1,'#232a31');
  g.fillStyle=grd;
  g.beginPath();
  g.moveTo(-30,-24); g.quadraticCurveTo(26,-30,40,4);
  g.quadraticCurveTo(46,40,4,48); g.quadraticCurveTo(-34,44,-38,10);
  g.closePath(); g.fill();
  g.fillStyle='#1b2127';
  for(var i=0;i<3;i++){ g.save(); g.translate(-12+i*17,-16); g.rotate(0.1*i);
    g.fillRect(0,0,13,26); g.restore(); }
  g.fillStyle='rgba(255,255,255,.07)';
  g.fillRect(-24,-18,46,8);
  g.restore();
}
