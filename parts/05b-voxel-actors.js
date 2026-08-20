/* ============================================================================
   17b. VOXEL ACTORS  --  real 3D box characters
   ----------------------------------------------------------------------------
   Bots were flat billboards. They are now built from actual boxes, projected
   through the same camera as the walls and rasterised into the same per-pixel
   depth buffer, so they rotate properly, self-occlude, and get hidden behind
   cover correctly.

   Each box is defined in character-local space (x = right, y = forward,
   z = up, origin between the feet), then tilted (for death), yawed to the
   actor's facing, and translated into the world. Faces are flat shaded off
   their world normal -- top brightest, sun-facing sides next, bottom darkest --
   which is what gives the chunky toy look.
   ============================================================================ */
var VOX_NEAR=0.10;

/* scratch, reused every face so the renderer allocates nothing per frame */
var _wx=new Float64Array(10), _wy=new Float64Array(10), _wz=new Float64Array(10),
    _cx=new Float64Array(10), _cy2=new Float64Array(10), _cd=new Float64Array(10),
    _px=new Float64Array(10), _py=new Float64Array(10);

function rasterTri(x0,y0,d0,x1,y1,d1,x2,y2,d2,r,g,b){
  var area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
  if(area===0) return;
  if(area<0){ // keep a single winding
    var tx=x1; x1=x2; x2=tx;
    var ty=y1; y1=y2; y2=ty;
    var td=d1; d1=d2; d2=td;
    area=-area;
  }
  var minx=floor(min(x0,min(x1,x2))), maxx=Math.ceil(max(x0,max(x1,x2)));
  var miny=floor(min(y0,min(y1,y2))), maxy=Math.ceil(max(y0,max(y1,y2)));
  if(maxx<0||minx>RW-1||maxy<0||miny>RH-1) return;   // fully off screen
  if(minx<0)minx=0; if(miny<0)miny=0;
  if(maxx>RW-1)maxx=RW-1; if(maxy>RH-1)maxy=RH-1;
  if(minx>maxx||miny>maxy) return;
  // Safety net: a vertex sitting just past the near plane projects to enormous
  // screen coordinates, and the clamped bounding box then covers the whole
  // frame while almost every pixel fails the edge test. Skip those.
  if((maxx-minx)*(maxy-miny) > RW*RH*0.72) return;
  var inv=1/area;
  // interpolate 1/depth: linear in screen space under perspective
  var w0=1/d0, w1=1/d1, w2=1/d2;
  var buf=BUF, dep=DEPTH;
  for(var y=miny;y<=maxy;y++){
    var py=y+0.5, row=y*RW;
    for(var x=minx;x<=maxx;x++){
      var px=x+0.5;
      var b0=((x1-px)*(y2-py)-(x2-px)*(y1-py))*inv;
      if(b0<0) continue;
      var b1=((x2-px)*(y0-py)-(x0-px)*(y2-py))*inv;
      if(b1<0) continue;
      var b2=1-b0-b1;
      if(b2<0) continue;
      var d=1/(b0*w0+b1*w1+b2*w2);
      var o=row+x;
      if(d>=dep[o]) continue;
      buf[o]=(255<<24)|(b<<16)|(g<<8)|r;
      dep[o]=d;
    }
  }
}

/* Constant tables and corner scratch live at module scope: this runs for every
   box of every actor every frame, and allocating here was enough GC churn on
   its own to stall the tab. */
var VOX_SX=[-1,1,1,-1,-1,1,1,-1], VOX_SY=[-1,-1,1,1,-1,-1,1,1], VOX_SZ=[-1,-1,-1,-1,1,1,1,1];
var VOX_FACES=[[0,1,2,3, 0,0,-1],[4,7,6,5, 0,0,1],
               [0,4,5,1, 0,-1,0],[3,2,6,7, 0,1,0],
               [1,5,6,2, 1,0,0],[0,3,7,4, -1,0,0]];
var _bx=new Float64Array(8), _by=new Float64Array(8), _bz=new Float64Array(8);

/* one box: centre + half extents in local space, already-rotated basis */
function drawBox(ox,oy,oz, hx,hy,hz, ax,ay, tiltC,tiltS, col, lightMul){
  // local axes after yaw: right = (ax,ay,0), fwd = (-ay,ax,0), up = z
  // tilt rotates in the (fwd,up) plane about the character's feet
  var i;
  var sxs=VOX_SX, sys=VOX_SY, szs=VOX_SZ;
  var wx=_bx, wy=_by, wz=_bz;
  for(i=0;i<8;i++){
    var lx=ox+sxs[i]*hx, ly=oy+sys[i]*hy, lz=oz+szs[i]*hz;
    // tilt about local X (feet pivot at z=0)
    var ty=ly*tiltC - lz*tiltS;
    var tz=ly*tiltS + lz*tiltC;
    // yaw into world
    wx[i]=lx*ax - ty*ay;
    wy[i]=lx*ay + ty*ax;
    wz[i]=tz;
  }
  for(var f=0;f<6;f++){
    var F=VOX_FACES[f];
    // rotate the normal the same way
    var nlx=F[4], nly=F[5], nlz=F[6];
    var nty=nly*tiltC - nlz*tiltS, ntz=nly*tiltS + nlz*tiltC;
    var nx=nlx*ax - nty*ay, ny=nlx*ay + nty*ax, nz=ntz;
    // face centre in world
    var fcx=0, fcy=0, fcz=0;
    for(i=0;i<4;i++){ fcx+=wx[F[i]]; fcy+=wy[F[i]]; fcz+=wz[F[i]]; }
    fcx=fcx*0.25+VOX_X; fcy=fcy*0.25+VOX_Y; fcz*=0.25;
    // backface cull against the eye
    if((fcx-CAM.x)*nx+(fcy-CAM.y)*ny+(fcz-CAM.eye)*nz >= 0) continue;
    // shade: top bright, bottom dark, sides by sun
    var shade;
    if(nz>0.5) shade=1.06;
    else if(nz<-0.5) shade=0.42;
    else shade=0.66+0.30*max(0,nx*SUNX+ny*SUNY);
    shade*=lightMul;
    // gather + near-clip the quad
    var n=0;
    for(i=0;i<4;i++){
      var a=F[i], bIdx=F[(i+1)&3];
      var axw=wx[a]+VOX_X, ayw=wy[a]+VOX_Y, azw=wz[a];
      var bxw=wx[bIdx]+VOX_X, byw=wy[bIdx]+VOX_Y, bzw=wz[bIdx];
      var da=(axw-CAM.x)*CAM.dirX+(ayw-CAM.y)*CAM.dirY;
      var db=(bxw-CAM.x)*CAM.dirX+(byw-CAM.y)*CAM.dirY;
      if(da>=VOX_NEAR){ _wx[n]=axw; _wy[n]=ayw; _wz[n]=azw; n++; }
      if((da>=VOX_NEAR)!==(db>=VOX_NEAR)){
        var t=(VOX_NEAR-da)/(db-da);
        _wx[n]=axw+(bxw-axw)*t; _wy[n]=ayw+(byw-ayw)*t; _wz[n]=azw+(bzw-azw)*t; n++;
      }
    }
    if(n<3) continue;
    // project
    for(i=0;i<n;i++){
      var rx=_wx[i]-CAM.x, ry=_wy[i]-CAM.y, rz=_wz[i]-CAM.eye;
      var f0=rx*CAM.dirX+ry*CAM.dirY;
      var r0=-rx*CAM.dirY+ry*CAM.dirX;
      var fp=f0*CAM.cosP+rz*CAM.sinP;
      var up=-f0*CAM.sinP+rz*CAM.cosP;
      if(fp<0.02) fp=0.02;
      _px[i]=RW*0.5+(r0/f0)*CAM.proj;
      _py[i]=CAM.cy-(up/fp)*CAM.proj;
      _cd[i]=f0;
    }
    // distance fog + dynamic lights, evaluated at the face centre
    var fd=(fcx-CAM.x)*CAM.dirX+(fcy-CAM.y)*CAM.dirY;
    var fog=clamp((fd-16)/58,0,1); fog*=fog*0.92;
    var lr=0,lg=0,lb=0;
    for(var li=0;li<LIGHTS.length;li++){
      var L=LIGHTS[li];
      var ldx=L.x-fcx, ldy=L.y-fcy;
      var att=L.p*(L.life/L.max)/(1+(ldx*ldx+ldy*ldy)*1.3);
      if(att>0.004){ lr+=L.r*att; lg+=L.g*att; lb+=L.b*att; }
    }
    var k=(1-fog);
    var cr=clamp(((col>>16&255)*(shade+lr))*k+FOG_R*fog,0,255)|0;
    var cg=clamp(((col>>8&255)*(shade+lg))*k+FOG_G*fog,0,255)|0;
    var cb=clamp(((col&255)*(shade+lb))*k+FOG_B*fog,0,255)|0;
    for(i=1;i<n-1;i++)
      rasterTri(_px[0],_py[0],_cd[0], _px[i],_py[i],_cd[i],
                _px[i+1],_py[i+1],_cd[i+1], cr,cg,cb);
  }
}

/* world origin of the character currently being drawn */
var VOX_X=0, VOX_Y=0;

/* ---- palettes: the toy look, team-tinted ------------------------------- */
var VOXPAL=[
  { skin:0xF2C14E, hair:0x4A2E20, shirt:0x3E6E8E, shirt2:0x2E566E,
    pants:0x2A5C6B, shoe:0x2E3740, frame:0xE08A3C, lens:0xDFF6FF,
    trim:0xF2C14E, gun:0x23282D },
  { skin:0xE8B45C, hair:0x2E2118, shirt:0xB4553A, shirt2:0x8E402B,
    pants:0x4A4530, shoe:0x33302A, frame:0xD07A34, lens:0xFFD9A0,
    trim:0xE8B45C, gun:0x23282D }
];

/* ---- one character ------------------------------------------------------ */
function drawVoxelActor(a){
  var pal=VOXPAL[a.team];
  VOX_X=a.x; VOX_Y=a.y;
  var ax=cos(a.ang), ay=sin(a.ang);
  var dead=!a.alive;
  var tilt=0;
  if(dead){ tilt=min(1.45, (a.deadT||0)*4.2); }          // topple over on death
  var tC=cos(tilt), tS=sin(tilt);
  var lm=1;
  var crouch=a.crouching?0.72:1;

  // gait: legs and arms swing along the facing axis
  var ph=a.walkPhase? sin((a.walk||0)*1.0)*0.055 : 0;
  var bob=a.walkPhase? Math.abs(sin((a.walk||0)*1.0))*0.018 : 0;
  if(dead){ ph=0; bob=0; }

  // proportions follow the toy look: head is a good 40% of total height
  var legH=0.165*crouch, torsoH=0.130*crouch, headH=0.225;
  var legTop=legH*2, torsoTop=legTop+torsoH*2;

  // shoes
  drawBox(-0.075, ph, 0.030, 0.055,0.075,0.030, ax,ay,tC,tS, pal.shoe, lm);
  drawBox( 0.075,-ph, 0.030, 0.055,0.075,0.030, ax,ay,tC,tS, pal.shoe, lm);
  // legs
  drawBox(-0.075, ph*0.8, 0.030+legH, 0.050,0.052,legH, ax,ay,tC,tS, pal.pants, lm);
  drawBox( 0.075,-ph*0.8, 0.030+legH, 0.050,0.052,legH, ax,ay,tC,tS, pal.pants, lm);
  // torso
  drawBox(0,0, legTop+torsoH+bob, 0.135,0.070,torsoH, ax,ay,tC,tS, pal.shirt, lm);
  // waist trim
  drawBox(0,0, legTop+0.018+bob, 0.138,0.072,0.018, ax,ay,tC,tS, pal.trim, lm);
  // arms
  drawBox(-0.175,-ph*1.1, legTop+torsoH+bob, 0.042,0.045,torsoH*0.95, ax,ay,tC,tS, pal.shirt2, lm);
  drawBox( 0.175, ph*1.1, legTop+torsoH+bob, 0.042,0.045,torsoH*0.95, ax,ay,tC,tS, pal.shirt2, lm);
  // head
  var hz=torsoTop+headH+bob;
  drawBox(0,0, hz, 0.160,0.140,headH, ax,ay,tC,tS, pal.skin, lm);
  // hair slab, overhanging at the back
  drawBox(0,-0.022, hz+headH+0.030, 0.168,0.152,0.034, ax,ay,tC,tS, pal.hair, lm);
  drawBox(0,-0.142, hz+0.050, 0.168,0.024,headH*0.74, ax,ay,tC,tS, pal.hair, lm);
  // goggles: frames on the face, lenses proud of them
  var gy=0.142, gz=hz+0.034;
  drawBox(-0.076, gy, gz, 0.060,0.022,0.046, ax,ay,tC,tS, pal.frame, lm);
  drawBox( 0.076, gy, gz, 0.060,0.022,0.046, ax,ay,tC,tS, pal.frame, lm);
  drawBox(-0.076, gy+0.020, gz, 0.047,0.006,0.034, ax,ay,tC,tS, pal.lens, lm);
  drawBox( 0.076, gy+0.020, gz, 0.047,0.006,0.034, ax,ay,tC,tS, pal.lens, lm);
  // goggle strap round the sides
  drawBox(-0.160, gy-0.070, gz, 0.010,0.075,0.013, ax,ay,tC,tS, pal.frame, lm);
  drawBox( 0.160, gy-0.070, gz, 0.010,0.075,0.013, ax,ay,tC,tS, pal.frame, lm);
  // weapon held across the body
  if(!dead){
    drawBox(0.115, 0.175, legTop+torsoH*1.1+bob, 0.028,0.135,0.026, ax,ay,tC,tS, pal.gun, lm);
    drawBox(0.115, 0.055, legTop+torsoH*0.75+bob, 0.022,0.030,0.040, ax,ay,tC,tS, pal.gun, lm);
  }
}

function drawVoxelActors(){
  for(var i=0;i<BOTS.length;i++){
    var b=BOTS[i];
    if(!b.alive && (b.deadT||0)>6) continue;
    var dx=b.x-CAM.x, dy=b.y-CAM.y;
    var d2=dx*dx+dy*dy;
    if(d2>3600) continue;
    /* Frustum cull. This matters far more than it looks: an actor beside the
       camera has vertices just past the near plane, which project to enormous
       screen coordinates and make every face a full-frame bounding box. */
    var f0=dx*CAM.dirX+dy*CAM.dirY;
    var r0=-dx*CAM.dirY+dy*CAM.dirX;
    if(f0<0.5){ if(d2>4.0) continue; }              // behind, and not on top of us
    else if(Math.abs(r0) > CAM.tanHalf*f0+1.1) continue;   // outside the cone
    drawVoxelActor(b);
  }
}
