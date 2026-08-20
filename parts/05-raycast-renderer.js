/* ============================================================================
   15. RENDER TARGET / CAMERA
   ============================================================================ */
var RC=document.createElement('canvas'), RCTX=RC.getContext('2d',{alpha:false});
var IMG=null, BUF=null, DEPTH=null, RW=0, RH=0, VW=0, VH=0;
var CAM={x:0,y:0,ang:0,pitch:0,eye:0.56,tanHalf:0.75,proj:1,cy:0,cosP:1,sinP:0,
         dirX:1,dirY:0,planeX:0,planeY:1};
var SKYV=null;                 // per-row sky texture row, rebuilt each frame
var PITCH_LIMIT=1.45;          // ~83 deg up/down -- a real 3D look range
var SHAKE={x:0,y:0,m:0,r:0};
var FOG_R=214, FOG_G=229, FOG_B=241;
var FOGC=(255<<24)|(241<<16)|(229<<8)|214;

/* ---- dynamic point lights (muzzle flashes, explosions, streak fire) ---- */
var LIGHTS=[], LIGHT_MAX=4;
function addLight(x,y,z,r,g,b,power,life){
  if(LIGHTS.length>=LIGHT_MAX) LIGHTS.shift();
  LIGHTS.push({x:x,y:y,z:z,r:r,g:g,b:b,p:power,life:life,max:life});
}
function updateLights(dt){
  for(var i=LIGHTS.length-1;i>=0;i--){
    LIGHTS[i].life-=dt;
    if(LIGHTS[i].life<=0) LIGHTS.splice(i,1);
  }
}

/* ---- bloom + colour grade ---------------------------------------------- */
var BLOOM=null, BLOOM2=null, BW=0, BH=0;
var LUT_R=new Uint8Array(256), LUT_G=new Uint8Array(256), LUT_B=new Uint8Array(256);
(function buildLUT(){
  for(var i=0;i<256;i++){
    var v=i/255;
    // gentle filmic S-curve, then a warm-highlight / cool-shadow grade
    var s=v*v*(3-2*v);
    v=v*0.55+s*0.45;
    var r=v*1.045+0.010*(1-v);
    var g=v*1.000+0.004*(1-v);
    var b=v*0.962+0.022*(1-v);
    LUT_R[i]=clamp(r*255,0,255)|0;
    LUT_G[i]=clamp(g*255,0,255)|0;
    LUT_B[i]=clamp(b*255,0,255)|0;
  }
})();
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
  SKYV=new Int32Array(RH);
  BW=max(4,RW>>2); BH=max(4,RH>>2);
  BLOOM=new Float32Array(BW*BH*3);
  BLOOM2=new Float32Array(BW*BH*3);
  vctx.imageSmoothingEnabled=true;
  fctx.imageSmoothingEnabled=true;
}
window.addEventListener('resize',function(){ resizeRender(); });

function initRenderExtras(){
  buildGrain();
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
  /* --- true 3D camera -------------------------------------------------
     Pitch is a real rotation of the view basis, not a vertical shear, so
     verticals converge properly when you look up or down. A world point at
     horizontal distance d and height z projects through:
        f' =  d*cosP + (z-eye)*sinP        (depth along the pitched axis)
        u' = -d*sinP + (z-eye)*cosP        (height along the pitched axis)
        screenY = cy - (u'/f')*proj
     and the inverse, used per pixel to recover z:
        z = eye + d*(s*cosP + sinP) / (cosP - s*sinP),  s = (cy-y)/proj   */
  var pitch = clamp(P.pitch,-PITCH_LIMIT,PITCH_LIMIT);
  var cosP=cos(pitch), sinP=sin(pitch);
  var cy = RH*0.5 + SHAKE.y*RH*0.04 + P.bob*RH*0.010;
  var horizon = cy + (sinP/cosP)*proj;      // where eye level lands on screen

  CAM.x=P.x; CAM.y=P.y; CAM.ang=P.ang+SHAKE.x*0.03; CAM.pitch=pitch;
  CAM.eye=eye; CAM.tanHalf=tanHalf; CAM.proj=proj; CAM.cy=cy;
  CAM.cosP=cosP; CAM.sinP=sinP;
  CAM.dirX=cos(CAM.ang); CAM.dirY=sin(CAM.ang);
  CAM.planeX=-CAM.dirY*tanHalf; CAM.planeY=CAM.dirX*tanHalf;

  var dirX=CAM.dirX, dirY=CAM.dirY, planeX=CAM.planeX, planeY=CAM.planeY;
  var px=P.x, py=P.y;
  var buf=BUF, dep=DEPTH;
  var invProj=1/proj;

  // Prefill: guarantees every pixel is defined even if a pass skips a row
  // (fractional horizon, extreme pitch, rays leaving the map). Two typed-array
  // fills cost far less than hunting a stray unpainted scanline.
  buf.fill(FOGC); dep.fill(1e9);

  /* ---------------- SKY ---------------------------------------------- */
  /* Rows above the horizon look up into the sky dome. The vertical angle
     depends only on the row, so the texture row is precomputed per scanline
     and the elevation maps 0..90 deg onto the strip -- look straight up and
     you get the zenith instead of running off the top of the texture. */
  var skyPx=SKY.px;
  var yBot=min(RH-1, Math.ceil(horizon));
  for(var ys=0; ys<=yBot; ys++){
    var s0=(cy-ys)*invProj;
    var dv=sinP+s0*cosP, dh=cosP-s0*sinP;
    var elev=atan2(dv, dh>1e-6?dh:1e-6);          // 0 at horizon, PI/2 at zenith
    var vv=(1-clamp(elev/(PI*0.5),0,1))*(SKYH-1);
    SKYV[ys]=vv|0;
  }
  for(var x=0;x<RW;x++){
    var camX=2*x/RW-1;
    var rdx=dirX+planeX*camX, rdy=dirY+planeY*camX;
    var a=atan2(rdy,rdx)/TAU; a-=floor(a);
    var su=(a*SKYW)|0; if(su<0)su=0; if(su>=SKYW)su=SKYW-1;
    for(var y=0;y<=yBot;y++){
      var i=y*RW+x;
      buf[i]=skyPx[SKYV[y]*SKYW+su];
      dep[i]=1e9;
    }
  }

  /* ---------------- FLOOR --------------------------------------------- */
  var rx0=dirX-planeX, ry0=dirY-planeY, rx1=dirX+planeX, ry1=dirY+planeY;
  var fogStart=16, fogSpan=1/58;      // lighter haze: distance stays readable
  for(var y2=max(0,yBot); y2<RH; y2++){
    // ray elevation for this scanline; only rows aimed below eye level hit ground
    var sf=(cy-y2)*invProj;
    var dvf=sinP+sf*cosP, dhf=cosP-sf*sinP;
    if(dvf>=-1e-4||dhf<=1e-6) continue;
    var rowD=eye*dhf/(-dvf);
    if(rowD<0.02) continue;
    if(rowD>62){ // beyond the fog wall -> flat haze
      var iRow=y2*RW;
      for(var xf=0;xf<RW;xf++){ buf[iRow+xf]=FOGC; dep[iRow+xf]=rowD; }
      continue;
    }
    var stepX=rowD*(rx1-rx0)/RW, stepY=rowD*(ry1-ry0)/RW;
    var fX=px+rowD*rx0, fY=py+rowD*ry0;
    var fog=clamp((rowD-fogStart)*fogSpan,0,1); fog*=fog*0.92;
    var fr=FOG_R*fog, fg=FOG_G*fog, fb=FOG_B*fog, base=(1-fog);
    var row=y2*RW, nL=LIGHTS.length;
    for(var x2=0;x2<RW;x2++){
      // floor() not |0: for coords in (-1,0) truncation would pass the bounds
      // check and then index the texture negatively.
      // NB: tile coords must NOT be named cy -- `var` is function scoped and
      // would clobber the camera centre used by every later scanline.
      var tcx=floor(fX), tcy=floor(fY), o=row+x2;
      if(tcx>=0&&tcy>=0&&tcx<MW&&tcy<MH){
        var ti=idx(tcx,tcy);
        var t=FLOORTEX[FLR[ti]]||FLOORTEX[0];
        var tx=((fX-tcx)*TS)|0, ty=((fY-tcy)*TS)|0;
        var c=t.px[ty*TS+tx];
        var sh=base*LIGHT[ti];
        var lr=0,lg=0,lb=0;
        for(var li=0;li<nL;li++){
          var L=LIGHTS[li];
          var ldx=L.x-fX, ldy=L.y-fY;
          var att=L.p*(L.life/L.max)/(1+(ldx*ldx+ldy*ldy+L.z*L.z)*1.3);
          if(att>0.004){ lr+=L.r*att; lg+=L.g*att; lb+=L.b*att; }
        }
        buf[o]=(255<<24)|
          ((((c>>16&255)*(sh+lb)+fb)|0)<<16)|
          ((((c>>8&255)*(sh+lg)+fg)|0)<<8)|
          (((c&255)*(sh+lr)+fr)|0);
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
      // project the wall's foot (z=0) and head (z=hgt) through the pitched camera
      var fb=d*cosP+(0-eye)*sinP,    ub=-d*sinP+(0-eye)*cosP;
      var ft=d*cosP+(hgt-eye)*sinP,  ut=-d*sinP+(hgt-eye)*cosP;
      var yb = fb>1e-4 ? cy-(ub/fb)*proj : (ub>0?-1e7:1e7);
      var yt = ft>1e-4 ? cy-(ut/ft)*proj : (ut>0?-1e7:1e7);
      if(yt>yb){ var sw=yt; yt=yb; yb=sw; }
      var y0=Math.ceil(yt), y1=floor(yb);
      if(y1<0||y0>=RH) continue;
      var rep=hgt>1.6?2:1;
      var texX=(hitsW[k]*TS)|0; if(texX<0)texX=0; if(texX>=TS)texX=TS-1;
      // shading: face orientation + sun + baked light + fog
      var sd=hitsS[k];
      var nx = sd===0?hitsN[k]:0, ny = sd===1?hitsN[k]:0;
      var sun = max(0, nx*SUNX+ny*SUNY);
      var sh = ((sd===0?1.0:0.86) + sun*0.22) * (0.72+0.28*LIGHT[hitsI[k]]);
      // dynamic lights, evaluated once at the wall hit point for this column
      var hx=px+rdx2*d, hy=py+rdy2*d, lr2=0, lg2=0, lb2=0;
      for(var li2=0;li2<LIGHTS.length;li2++){
        var L2=LIGHTS[li2];
        var lx2=L2.x-hx, ly2=L2.y-hy;
        var at2=L2.p*(L2.life/L2.max)/(1+(lx2*lx2+ly2*ly2)*1.3);
        if(at2>0.004){ lr2+=L2.r*at2; lg2+=L2.g*at2; lb2+=L2.b*at2; }
      }
      var fog2=clamp((d-fogStart)*fogSpan,0,1); fog2*=fog2*0.92;
      var a2=sh*(1-fog2);
      var ar=(sh+lr2)*(1-fog2), ag=(sh+lg2)*(1-fog2), ab=(sh+lb2)*(1-fog2);
      var fr2=FOG_R*fog2, fg2=FOG_G*fog2, fb2=FOG_B*fog2;
      var yA=y0<0?0:y0, yB=y1>=RH?RH-1:y1;
      var col32=tex.px;
      var vScale=rep/hgt;
      var sp=(cy-yA)*invProj, spStep=-invProj;
      // hits are drawn far -> near, so nearer walls simply overwrite; testing
      // against the floor's depth here would punch floor-coloured specks
      // through wall bases where rowDistance ~= perpWallDist.
      for(var y3=yA;y3<=yB;y3++, sp+=spStep){
        var o2=y3*RW+col;
        // recover the world height this pixel sees, then wrap it into the texture
        var den=cosP-sp*sinP;
        var zw=eye+d*(sp*cosP+sinP)/(den!==0?den:1e-6);
        var vv=zw*vScale; vv-=floor(vv);
        var ty2=(vv*TS)|0; if(ty2<0)ty2=0; else if(ty2>=TS)ty2=TS-1;
        var c2=col32[(TS-1-ty2)*TS+texX];
        buf[o2]=(255<<24)|
          ((((c2>>16&255)*ab+fb2)|0)<<16)|
          ((((c2>>8&255)*ag+fg2)|0)<<8)|
          (((c2&255)*ar+fr2)|0);
        dep[o2]=d;
      }
    }
  }

  /* ---------------- VOXEL ACTORS (real 3D geometry) --------------------- */
  drawVoxelActors();

  /* ---------------- SPRITES -------------------------------------------- */
  var list=[];
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
  for(var s2=0;s2<list.length;s2++) drawSprite(list[s2],invDet,px,py,proj,cy,eye,cosP,sinP);

  postProcess();
  RCTX.putImageData(IMG,0,0);
  vctx.drawImage(RC,0,0,RW,RH,0,0,VW,VH);
}

/* ---------------------------------------------------------------------------
   Post: bright-pass bloom at quarter res, then composite + filmic grade.
   Two full-buffer passes; the blur itself runs on 1/16th the pixels.
   --------------------------------------------------------------------------- */
function postProcess(){
  var buf=BUF, n=RW*RH;
  var doBloom = S.bloom!==0;
  if(doBloom){
    var bl=BLOOM, b2=BLOOM2, i, j;
    for(i=0;i<bl.length;i++) bl[i]=0;
    // bright pass, quarter-res nearest sample
    for(var by=0;by<BH;by++){
      var syy=(by<<2)*RW, row=by*BW*3;
      for(var bx=0;bx<BW;bx++){
        var c=buf[syy+(bx<<2)];
        var r=c&255, g=c>>8&255, b=c>>16&255;
        var lum=r*0.299+g*0.587+b*0.114;
        if(lum>188){
          var e=(lum-188)/67; if(e>1.6)e=1.6;
          var o=row+bx*3;
          bl[o]=r*e; bl[o+1]=g*e; bl[o+2]=b*e;
        }
      }
    }
    // separable blur (radius 2) -> b2 -> bl
    for(var y1=0;y1<BH;y1++){
      var ro=y1*BW*3;
      for(var x1=0;x1<BW;x1++){
        var sr=0,sg=0,sb=0,cnt=0;
        for(var k=-2;k<=2;k++){
          var xx=x1+k; if(xx<0||xx>=BW) continue;
          var oo=ro+xx*3; sr+=bl[oo]; sg+=bl[oo+1]; sb+=bl[oo+2]; cnt++;
        }
        var op=ro+x1*3; b2[op]=sr/cnt; b2[op+1]=sg/cnt; b2[op+2]=sb/cnt;
      }
    }
    for(var y2=0;y2<BH;y2++){
      for(var x2=0;x2<BW;x2++){
        var sr2=0,sg2=0,sb2=0,c2=0;
        for(var k2=-2;k2<=2;k2++){
          var yy=y2+k2; if(yy<0||yy>=BH) continue;
          var o2=(yy*BW+x2)*3; sr2+=b2[o2]; sg2+=b2[o2+1]; sb2+=b2[o2+2]; c2++;
        }
        var op2=(y2*BW+x2)*3; bl[op2]=sr2/c2; bl[op2+1]=sg2/c2; bl[op2+2]=sb2/c2;
      }
    }
  }
  // composite + saturation + grade
  var amt=S.bloom===undefined?0.42:S.bloom;
  for(var y=0;y<RH;y++){
    var brow=((y>>2)*BW)*3, orow=y*RW;
    for(var x=0;x<RW;x++){
      var p=buf[orow+x];
      var R=p&255, G=p>>8&255, B=p>>16&255;
      if(doBloom){
        var bo=brow+((x>>2)*3);
        R+=BLOOM[bo]*amt; G+=BLOOM[bo+1]*amt; B+=BLOOM[bo+2]*amt;
      }
      // subtle saturation lift
      var l=R*0.299+G*0.587+B*0.114;
      R=l+(R-l)*1.13; G=l+(G-l)*1.13; B=l+(B-l)*1.13;
      if(R<0)R=0; else if(R>255)R=255;
      if(G<0)G=0; else if(G>255)G=255;
      if(B<0)B=0; else if(B>255)B=255;
      buf[orow+x]=(255<<24)|(LUT_B[B|0]<<16)|(LUT_G[G|0]<<8)|LUT_R[R|0];
    }
  }
}

function drawSprite(s,invDet,px,py,proj,cy,eye,cosP,sinP){
  var sx=s.x-px, sy=s.y-py;
  var dirX=CAM.dirX, dirY=CAM.dirY, planeX=CAM.planeX, planeY=CAM.planeY;
  var tX=invDet*(dirY*sx-dirX*sy);
  var tY=invDet*(-planeY*sx+planeX*sy);
  if(tY<0.12) return;
  var scrX=(RW*0.5)*(1+tX/tY);
  var wPix=s.w*proj/tY;
  // project the billboard's foot and head through the same pitched camera
  var zb=s.z, zt=s.z+s.h;
  var fb=tY*cosP+(zb-eye)*sinP, ub=-tY*sinP+(zb-eye)*cosP;
  var ft=tY*cosP+(zt-eye)*sinP, ut=-tY*sinP+(zt-eye)*cosP;
  if(fb<0.05||ft<0.05) return;
  var yBot=cy-(ub/fb)*proj, yTop=cy-(ut/ft)*proj;
  var hPix=yBot-yTop;
  if(wPix<0.7||hPix<0.7) return;
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

var SUN_AZ=(300/1024)*TAU, SUN_EL=1.22;   // matches the sun painted into the sky
var GRAINTILE=null;
function buildGrain(){
  GRAINTILE=document.createElement('canvas');
  GRAINTILE.width=GRAINTILE.height=128;
  var g=GRAINTILE.getContext('2d');
  var im=g.createImageData(128,128), d=im.data;
  for(var i=0;i<d.length;i+=4){
    var v=190+rnd()*65|0;
    d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  g.putImageData(im,0,0);
}
/* project a world direction (azimuth/elevation) to screen, or null if behind */
function projectDir(az,el){
  var rel=az-CAM.ang;
  var ce=cos(el);
  var fwd=cos(rel)*ce, rgt=sin(rel)*ce, up=sin(el);
  var f= fwd*CAM.cosP + up*CAM.sinP;
  if(f<0.06) return null;
  var u=-fwd*CAM.sinP + up*CAM.cosP;
  var ps=(VW*0.5)/CAM.tanHalf;
  return { x: VW*0.5 + (rgt/f)*ps,
           y: CAM.cy*(VH/RH) - (u/f)*ps, f:f };
}
function drawSunFlare(){
  if(!S.flare) return;
  var p=projectDir(SUN_AZ,SUN_EL);
  if(!p) return;
  if(p.x<-VW*0.4||p.x>VW*1.4||p.y<-VH*0.4||p.y>VH*1.4) return;
  var g=fctx;
  var cxs=VW*0.5, cys=VH*0.5;
  var off=sqrt((p.x-cxs)*(p.x-cxs)+(p.y-cys)*(p.y-cys));
  var fade=clamp(1-off/(VW*0.75),0,1);
  if(fade<=0.01) return;
  g.save();
  g.globalCompositeOperation='lighter';
  var r0=VH*0.30*fade;
  var gr=g.createRadialGradient(p.x,p.y,0,p.x,p.y,r0);
  gr.addColorStop(0,'rgba(255,250,225,'+(0.42*fade)+')');
  gr.addColorStop(.25,'rgba(255,225,160,'+(0.16*fade)+')');
  gr.addColorStop(1,'rgba(255,200,120,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(p.x,p.y,r0,0,TAU); g.fill();
  // ghosts strung back through the screen centre
  var ghosts=[[0.32,26,'rgba(140,200,255,'],[0.62,15,'rgba(255,190,120,'],
              [0.90,22,'rgba(180,255,200,'],[1.26,11,'rgba(255,150,150,']];
  for(var i=0;i<ghosts.length;i++){
    var t=ghosts[i][0];
    var gx=p.x+(cxs-p.x)*t*2, gy=p.y+(cys-p.y)*t*2;
    g.fillStyle=ghosts[i][2]+(0.075*fade)+')';
    g.beginPath(); g.arc(gx,gy,ghosts[i][1]*fade+4,0,TAU); g.fill();
  }
  g.restore();
}
function drawGrain(){
  if(!S.grain||!GRAINTILE) return;
  var g=fctx;
  g.save();
  g.globalCompositeOperation='overlay';
  g.globalAlpha=0.045;
  var ox=-(rnd()*128)|0, oy=-(rnd()*128)|0;
  var pat=g.createPattern(GRAINTILE,'repeat');
  g.fillStyle=pat;
  g.translate(ox,oy);
  g.fillRect(0,0,VW+128,VH+128);
  g.restore();
}
function drawVignette(){
  var g=fctx;
  var gr=g.createRadialGradient(VW*0.5,VH*0.5,VH*0.32,VW*0.5,VH*0.5,VH*0.92);
  gr.addColorStop(0,'rgba(0,0,0,0)');
  gr.addColorStop(1,'rgba(0,0,0,.42)');
  g.fillStyle=gr; g.fillRect(0,0,VW,VH);
}

function drawOverlay(dt){
  fctx.clearRect(0,0,VW,VH);
  var w=W(), ads=easeAds(P.ads);

  /* --- atmospherics behind the weapon --- */
  drawSunFlare();
  drawVignette();
  drawGrain();

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
