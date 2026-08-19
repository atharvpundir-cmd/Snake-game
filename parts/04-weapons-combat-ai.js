/* ============================================================================
   8. GAME STATE
   ============================================================================ */
var G = {
  mode:'menu',            // menu | play | paused | over
  t:0, dt:0,
  matchLen:600, timeLeft:600, scoreLimit:75,
  score:[0,0],            // [friendly, enemy]
  started:false,
  uav:0, lodestar:0, lodestarT:0,
  slowmo:1, endWin:false
};
var BOTS=[], FXS=[], PICKUPS=[], DECALS=[];
var NAMES_F=['Vulcan','Rook','Hazard','Sable'];
var NAMES_E=['Kestrel','Bravo6','Rictus','Vandal','Ghostt'];

/* ============================================================================
   9. WEAPONS
   ============================================================================ */
var WDEF = {
  ballista:{ id:'ballista', name:'BALLISTA', cls:'SNIPER', mode:'BOLT ACTION',
    mag:5, reserve:30, maxRes:30, dmg:105, hsMul:1.9, legMul:0.72,
    rof:0.10, bolt:0.88, reload:2.65, adsT:0.34, zoom:0.30,
    hipSpread:0.115, adsSpread:0.0009, recoilV:0.085, recoilH:0.020, kick:19,
    auto:false, snd:'sniper', scope:true, pierce:2, moveMul:0.84, range:60 },
  dsr:{ id:'dsr', name:'DSR-50', cls:'SNIPER', mode:'BOLT ACTION',
    mag:4, reserve:24, maxRes:24, dmg:112, hsMul:1.9, legMul:0.75,
    rof:0.10, bolt:1.02, reload:2.9, adsT:0.38, zoom:0.26,
    hipSpread:0.13, adsSpread:0.0008, recoilV:0.098, recoilH:0.024, kick:23,
    auto:false, snd:'sniper', scope:true, pierce:2, moveMul:0.80, range:64 },
  msmc:{ id:'msmc', name:'MSMC', cls:'SMG', mode:'FULL AUTO',
    mag:32, reserve:192, maxRes:192, dmg:27, hsMul:1.4, legMul:0.9,
    rof:0.0685, bolt:0, reload:2.05, adsT:0.20, zoom:0.72,
    hipSpread:0.052, adsSpread:0.011, recoilV:0.017, recoilH:0.010, kick:3.4,
    auto:true, snd:'smg', scope:false, pierce:1, moveMul:1.0, range:26 },
  m27:{ id:'m27', name:'M27', cls:'LMG', mode:'FULL AUTO', attach:'FAST MAG',
    mag:75, reserve:225, maxRes:225, dmg:31, hsMul:1.4, legMul:0.9,
    rof:0.0805, bolt:0, reload:2.2, adsT:0.27, zoom:0.66,
    hipSpread:0.062, adsSpread:0.0135, recoilV:0.021, recoilH:0.012, kick:4.2,
    auto:true, snd:'lmg', scope:false, pierce:1, moveMul:0.90, range:34 },
  an94:{ id:'an94', name:'AN-94', cls:'ASSAULT', mode:'FULL AUTO', attach:'REFLEX',
    mag:30, reserve:180, maxRes:180, dmg:34, hsMul:1.4, legMul:0.9,
    rof:0.0857, bolt:0, reload:2.15, adsT:0.24, zoom:0.66,
    hipSpread:0.055, adsSpread:0.0095, recoilV:0.024, recoilH:0.011, kick:4.6,
    auto:true, snd:'smg', scope:false, pierce:1, moveMul:0.95, range:32 },
  vector:{ id:'vector', name:'VECTOR K10', cls:'SMG', mode:'FULL AUTO', attach:'RAPID FIRE',
    mag:25, reserve:175, maxRes:175, dmg:21, hsMul:1.4, legMul:0.9,
    rof:0.0545, bolt:0, reload:1.95, adsT:0.19, zoom:0.74,
    hipSpread:0.058, adsSpread:0.013, recoilV:0.014, recoilH:0.011, kick:2.9,
    auto:true, snd:'smg', scope:false, pierce:1, moveMul:1.02, range:22 }
};
function mkWeapon(id){
  var d=WDEF[id];
  return { def:d, mag:d.mag, reserve:d.reserve, st:'idle', t:0, reloadStage:0, boltStage:0 };
}
function wpnLabel(w){ return w.def.name + (w.def.attach? ' '+w.def.attach : ''); }

/* ============================================================================
   10. PLAYER
   ============================================================================ */
var P = {
  isPlayer:true, team:0, name:'PLAYER', x:28.5, y:40.5, ang:-PI/2, pitch:0,
  vx:0, vy:0, z:0, vz:0, eye:0.56, crouchT:0,
  hp:100, maxhp:100, alive:true, respawn:0, radius:0.26, height:1.0,
  weapons:[mkWeapon('ballista'), mkWeapon('msmc')], cur:0,
  ads:0, adsWant:0, recoilV:0, recoilH:0, kick:0, kickV:0,
  bob:0, bobT:0, stepT:0, sprint:0, sprintT:0,
  score:0, kills:0, deaths:0, streak:0, best:0, hits:0, shots:0, hs:0,
  lastHurt:-99, lastKillT:-99, comboKills:0, lastKilledBy:null, firstBlood:false,
  flinch:0, breath:0
};
function W(){ return P.weapons[P.cur]; }
function isSniping(){ return W().def.scope && P.ads>0.75; }

/* ============================================================================
   11. FX / PARTICLES / DECALS
   ============================================================================ */
function fxSpawn(o){
  if(FXS.length>240) FXS.shift();
  FXS.push({ x:o.x, y:o.y, z:o.z, vx:o.vx||0, vy:o.vy||0, vz:o.vz||0,
    life:o.life, max:o.life, spr:o.spr, size:o.size||0.35, grav:o.grav||0,
    add:o.add||0, spin:o.spin||0, fade:o.fade===undefined?1:o.fade,
    grow:o.grow||0, a0:o.a0===undefined?1:o.a0 });
}
/* glowing tracer beads strung along the bullet path */
function tracer(x0,y0,z0,dx,dy,dz,dist,hot){
  var n=min(10, max(3, (dist*0.55)|0));
  for(var i=1;i<=n;i++){
    var f=i/n, t=f*dist;
    fxSpawn({x:x0+dx*t, y:y0+dy*t, z:z0+dz*t,
      life:0.05+0.03*f, spr:SPR.spark, size:0.042-0.018*f,
      add:1, a0:hot?0.95:0.55, grav:0});
  }
}
function decal(x,y,z,side){
  if(DECALS.length>90) DECALS.shift();
  DECALS.push({x:x,y:y,z:z,life:26,max:26,side:side,size:0.10+rnd()*0.05});
}
function impactFX(x,y,z,nx,ny,mat){
  var n=ri(4,7);
  for(var i=0;i<n;i++)
    fxSpawn({x:x,y:y,z:z, vx:nx*rr(.4,1.6)+rr(-.5,.5), vy:ny*rr(.4,1.6)+rr(-.5,.5),
      vz:rr(.3,2.0), life:rr(.25,.55), spr:SPR.spark, size:rr(.035,.08), grav:4.2, add:1});
  fxSpawn({x:x+nx*.02,y:y+ny*.02,z:z, vx:nx*.25,vy:ny*.25,vz:.5, life:rr(.5,.9),
    spr:SPR.smoke, size:.16, grow:.5, a0:.5});
  for(var j=0;j<3;j++)
    fxSpawn({x:x,y:y,z:z, vx:nx*rr(.3,1.1)+rr(-.4,.4), vy:ny*rr(.3,1.1)+rr(-.4,.4),
      vz:rr(.5,1.8), life:rr(.4,.8), spr:SPR.debris, size:rr(.04,.09), grav:5.5});
  decal(x,y,z,0);
}
function bloodFX(x,y,z,dx,dy,big){
  var n=big?16:8;
  for(var i=0;i<n;i++)
    fxSpawn({x:x,y:y,z:z, vx:dx*rr(.4,2.2)+rr(-.7,.7), vy:dy*rr(.4,2.2)+rr(-.7,.7),
      vz:rr(.2,2.2), life:rr(.3,.7), spr:SPR.blood, size:rr(.05,big?.20:.13), grav:5.0});
}
function updateFX(dt){
  for(var i=FXS.length-1;i>=0;i--){
    var f=FXS[i]; f.life-=dt;
    if(f.life<=0){ FXS.splice(i,1); continue; }
    f.x+=f.vx*dt; f.y+=f.vy*dt; f.z+=f.vz*dt; f.vz-=f.grav*dt;
    if(f.z<0.03){ f.z=0.03; f.vz*=-0.28; f.vx*=0.6; f.vy*=0.6; }
    if(f.grow) f.size+=f.grow*dt;
  }
  for(var j=DECALS.length-1;j>=0;j--){ DECALS[j].life-=dt; if(DECALS[j].life<=0) DECALS.splice(j,1); }
}

/* ============================================================================
   12. WORLD QUERIES  (collision, LOS, hitscan)
   ============================================================================ */
function tileBlocked(x,y){ var m=solid(x,y); return m!==0; }
function moveEnt(e,dx,dy,r){
  var nx=e.x+dx, ny=e.y+dy;
  if(!tileBlocked(nx+ (dx>0?r:-r), e.y)) e.x=nx;
  else { // slide along
    if(!tileBlocked(nx+(dx>0?r:-r), e.y+r) && !tileBlocked(nx+(dx>0?r:-r), e.y-r)) e.x=nx;
  }
  if(!tileBlocked(e.x, ny+(dy>0?r:-r))) e.y=ny;
  else {
    if(!tileBlocked(e.x+r, ny+(dy>0?r:-r)) && !tileBlocked(e.x-r, ny+(dy>0?r:-r))) e.y=ny;
  }
  e.x=clamp(e.x,1.1,MW-1.1); e.y=clamp(e.y,1.1,MH-1.1);
}
/* DDA -> distance to the first solid tile along a normalised direction */
function castWall(px,py,dx,dy,maxD){
  var mx=px|0, my=py|0;
  var ddx = dx===0?1e30:abs(1/dx), ddy = dy===0?1e30:abs(1/dy);
  var sx,sy,sdx,sdy;
  if(dx<0){ sx=-1; sdx=(px-mx)*ddx; } else { sx=1; sdx=(mx+1-px)*ddx; }
  if(dy<0){ sy=-1; sdy=(py-my)*ddy; } else { sy=1; sdy=(my+1-py)*ddy; }
  var side=0, guard=0;
  while(guard++<600){
    if(sdx<sdy){ sdx+=ddx; mx+=sx; side=0; } else { sdy+=ddy; my+=sy; side=1; }
    if(mx<0||my<0||mx>=MW||my>=MH) return {d:maxD, side:side, tex:1, mx:mx, my:my};
    if(MAP[idx(mx,my)]){
      var d = side===0 ? (sdx-ddx) : (sdy-ddy);
      return {d:d, side:side, tex:MAP[idx(mx,my)], mx:mx, my:my};
    }
    if((side===0?sdx:sdy)>maxD) break;
  }
  return {d:maxD, side:side, tex:0, mx:mx, my:my};
}
function losClear(ax,ay,bx,by){
  var dx=bx-ax, dy=by-ay, d=sqrt(dx*dx+dy*dy);
  if(d<0.001) return true;
  var w=castWall(ax,ay,dx/d,dy/d,d+0.5);
  return w.d>=d-0.05;
}
function allActors(){ var a=[P]; for(var i=0;i<BOTS.length;i++) a.push(BOTS[i]); return a; }

/* Hitscan that can pierce N bodies. Returns list of hits ordered by distance. */
function hitscan(sx,sy,sz,dx,dy,dz,shooter,maxD,pierce){
  var wall=castWall(sx,sy,dx,dy,maxD);
  var wallD=wall.d, out=[], acts=allActors();
  for(var i=0;i<acts.length;i++){
    var e=acts[i];
    if(e===shooter||!e.alive) continue;
    var ex=e.x-sx, ey=e.y-sy;
    var tc = ex*dx+ey*dy;
    if(tc<0.15) continue;
    var perp = abs(ex*dy - ey*dx);
    var r=e.radius+0.14;
    if(perp>r) continue;
    var back=sqrt(max(0,r*r-perp*perp));
    var t=tc-back; if(t<0) t=0.02;
    if(t>wallD) continue;
    var hz = sz+dz*t;
    var hgt = e.height*(e.crouching?0.66:1);
    if(hz<0.04||hz>hgt) continue;
    out.push({ent:e, d:t, z:hz, hgt:hgt});
  }
  out.sort(function(a,b){return a.d-b.d;});
  if(out.length>pierce) out.length=pierce;
  return {wall:wall, wallD:wallD, hits:out};
}
function zoneOf(hz,hgt){
  var f=hz/hgt;
  if(f>0.80) return 'head';
  if(f<0.42) return 'leg';
  return 'body';
}

/* ============================================================================
   13. DAMAGE / KILLS
   ============================================================================ */
function damage(target, amount, attacker, wname, zone, dist){
  if(!target.alive) return false;
  target.hp -= amount;
  if(target.isPlayer){
    P.lastHurt=G.t; P.flinch=min(1, P.flinch+amount/120);
    hitDirection(attacker); shakeAdd(amount*0.010);
    SND.hurt();
  }
  if(target.hp<=0){ target.hp=0; killActor(target, attacker, wname, zone, dist); return true; }
  return false;
}
function killActor(v, k, wname, zone, dist){
  v.alive=false; v.deaths=(v.deaths||0)+1; v.streak=0;
  v.deadT=0; v.respawn=v.isPlayer?5.2:rr(4.0,7.0);
  bloodFX(v.x,v.y,0.7, rnd()-0.5, rnd()-0.5, true);
  dropPickup(v);
  if(v.isPlayer){
    P.lastKilledBy=k? k.name : null;
    SND.die(); playerDied(k, wname);
  } else if(!v.isPlayer){
    SND.impact(panOf(v.x,v.y), volOf(v.x,v.y)*0.9);
  }
  if(k && k!==v){
    k.streak=(k.streak||0)+1; k.best=max(k.best||0,k.streak);
    k.kills=(k.kills||0)+1;
    // the player's score accrues through the floating +100/+50 popups in
    // playerKill(); adding it here too would double-count it
    if(!k.isPlayer) k.score=(k.score||0)+100;
    G.score[k.team]++;
    if(k.isPlayer) playerKill(v, wname, zone, dist);
    else if(v.isPlayer){ /* handled above */ }
    killfeed(k, v, wname, zone==='head');
    if(!k.isPlayer && !v.isPlayer) { /* bot on bot */ }
    checkMatchEnd();
  } else {
    killfeed(null, v, wname, false);
  }
}
function dropPickup(v){
  var w = v.isPlayer ? W().def : WDEF[v.wpn||'msmc'];
  if(rnd()<0.55||v.isPlayer){
    PICKUPS.push({ x:v.x, y:v.y, z:0.14, id:w.id, life:26, bob:rnd()*TAU });
    if(PICKUPS.length>10) PICKUPS.shift();
  }
}

/* ============================================================================
   14. BOTS
   ============================================================================ */
var SPAWN_F=[[28,40],[24,40],[32,40],[27,37],[30,37],[21,39],[35,39]];
var SPAWN_E=[[28,3],[24,3],[32,3],[27,6],[30,6],[21,4],[35,4]];
var ROAM=[[8,8],[14,12],[8,35],[14,31],[27,21],[47,8],[41,12],[47,35],[41,31],
          [21,21],[35,21],[28,9],[28,34],[20,16],[36,16],[20,28],[36,28],[2,22],[53,22],
          [9,21],[46,21],[28,15],[28,29]];

function mkBot(team,name,ii){
  var sp = team===0? SPAWN_F[ii%SPAWN_F.length] : SPAWN_E[ii%SPAWN_E.length];
  var b = {
    isPlayer:false, team:team, name:name, x:sp[0]+0.5, y:sp[1]+0.5, ang:team?PI/2:-PI/2,
    hp:100, maxhp:100, alive:true, radius:0.28, height:1.0, crouching:false,
    vx:0, vy:0, deadT:0, respawn:0,
    wpn: pick(team? ['an94','msmc','m27','ballista'] : ['msmc','an94','vector','m27']),
    st:'roam', tgt:null, lastSeen:null, seenT:0, path:[], pathT:0, goal:null,
    fireT:rr(.4,1.4), burst:0, burstGap:0, reload:0, mag:0,
    react:rr(.16,.42), aimErr:rr(.03,.09), skill:rr(.55,.92),
    walk:0, walkPhase:0, strafe:rnd()<0.5?1:-1, strafeT:rr(.7,2),
    kills:0, deaths:0, score:0, streak:0, best:0, think:rnd()*0.4
  };
  b.mag=WDEF[b.wpn].mag;
  return b;
}
function spawnTeams(){
  BOTS.length=0;
  for(var i=0;i<3;i++) BOTS.push(mkBot(0,NAMES_F[i],i+1));
  for(var j=0;j<4;j++) BOTS.push(mkBot(1,NAMES_E[j],j));
}
/* --- BFS over walkable tiles ------------------------------------------- */
var bfsQ=new Int32Array(MW*MH), bfsPrev=new Int32Array(MW*MH), bfsMark=new Int32Array(MW*MH), bfsGen=0;
function findPath(sx,sy,gx,gy){
  sx|=0; sy|=0; gx|=0; gy|=0;
  if(sx===gx&&sy===gy) return [];
  if(MAP[idx(gx,gy)]) return [];
  bfsGen++;
  var head=0,tail=0, s=idx(sx,sy), g=idx(gx,gy);
  bfsQ[tail++]=s; bfsMark[s]=bfsGen; bfsPrev[s]=-1;
  var found=false, guard=0;
  while(head<tail && guard++<3600){
    var c=bfsQ[head++];
    if(c===g){ found=true; break; }
    var cx=c%MW, cy=(c/MW)|0;
    for(var k=0;k<4;k++){
      var nx=cx+(k===0?1:k===1?-1:0), ny=cy+(k===2?1:k===3?-1:0);
      if(nx<1||ny<1||nx>=MW-1||ny>=MH-1) continue;
      var n=idx(nx,ny);
      if(bfsMark[n]===bfsGen||MAP[n]) continue;
      bfsMark[n]=bfsGen; bfsPrev[n]=c; bfsQ[tail++]=n;
    }
  }
  if(!found) return [];
  var out=[], cur=g, guard2=0;
  while(cur!==-1 && cur!==s && guard2++<1500){
    out.push([(cur%MW)+0.5, ((cur/MW)|0)+0.5]);
    cur=bfsPrev[cur];
  }
  out.reverse();
  return out;
}
function botSee(b,e){
  if(!e.alive) return false;
  var dx=e.x-b.x, dy=e.y-b.y, d=sqrt(dx*dx+dy*dy);
  if(d>30) return false;
  var a=atan2(dy,dx);
  if(abs(angDiff(a,b.ang))>1.85) return false;
  return losClear(b.x,b.y,e.x,e.y);
}
function botFire(b,tx,ty,tz){
  var d=WDEF[b.wpn];
  var dx=tx-b.x, dy=ty-b.y, dist=sqrt(dx*dx+dy*dy);
  var sp = (1-b.skill)*0.11 + b.aimErr*0.6 + (b.st==='engage'?0.012:0.05);
  if(d.cls==='SNIPER') sp*=0.55;
  var a=b.ang + rr(-sp,sp);
  var dz = ((tz - 0.62)/max(0.6,dist)) + rr(-sp,sp)*0.8;
  var ndx=cos(a), ndy=sin(a);
  var r=hitscan(b.x,b.y,0.62,ndx,ndy,dz,b,d.range+8,d.pierce);
  var pan=panOf(b.x,b.y), vol=volOf(b.x,b.y);
  SND.gunshot(d.snd,pan,vol);
  fxSpawn({x:b.x+ndx*0.42,y:b.y+ndy*0.42,z:0.66,life:0.055,spr:SPR.flash,size:0.30,add:1});
  addLight(b.x+ndx*0.5, b.y+ndy*0.5, 0.62, 1.0,0.82,0.45, 1.5, 0.06);
  tracer(b.x+ndx*0.5, b.y+ndy*0.5, 0.62, ndx,ndy,dz, min(r.wallD, d.range+8), false);
  b.mag--; b.lastFire=G.t;
  var hitSomething=false;
  for(var i=0;i<r.hits.length;i++){
    var h=r.hits[i];
    if(h.ent.team===b.team) break;             // don't shoot through friendlies
    var zone=zoneOf(h.z,h.hgt);
    var dmg=d.dmg*(zone==='head'?d.hsMul:zone==='leg'?d.legMul:1);
    if(dist>d.range) dmg*=max(0.55,1-(dist-d.range)*0.02);
    dmg*=lerp(0.72,1.06,b.skill);
    bloodFX(h.ent.x,h.ent.y,h.z,ndx,ndy,false);
    damage(h.ent,dmg,b,d.name,zone,dist);
    hitSomething=true;
  }
  if(!hitSomething){
    var wd=min(r.wallD,d.range+8);
    var hx=b.x+ndx*wd, hy=b.y+ndy*wd, hz=0.62+dz*wd;
    if(hz>0.02&&hz<1.6){ impactFX(hx,hy,hz,-ndx,-ndy); SND.impact(panOf(hx,hy),volOf(hx,hy)*0.7); }
    // near-miss crack for the player
    var mx=P.x-b.x, my=P.y-b.y, tproj=mx*ndx+my*ndy;
    if(P.alive&&tproj>0){ var pd=abs(mx*ndy-my*ndx); if(pd<1.5&&tproj<wd+1) SND.whiz(clamp((mx*ndy-my*ndx)*0.7,-1,1)); }
  }
}
function updateBot(b,dt){
  if(!b.alive){
    b.respawn-=dt; b.deadT=(b.deadT||0)+dt;
    if(b.respawn<=0){
      var sp = b.team===0? pick(SPAWN_F) : pick(SPAWN_E);
      b.x=sp[0]+0.5+rr(-.4,.4); b.y=sp[1]+0.5+rr(-.4,.4);
      b.hp=b.maxhp; b.alive=true; b.st='roam'; b.path=[]; b.pathT=0; b.tgt=null;
      b.mag=WDEF[b.wpn].mag; b.reload=0;
      b.wpn = b.team===0? pick(['an94','msmc','m27','ballista']) : pick(['msmc','an94','vector','m27']);
    }
    return;
  }
  var d=WDEF[b.wpn];
  b.think-=dt;
  // ---- target acquisition ------------------------------------------------
  if(b.think<=0){
    b.think=0.16+rnd()*0.14;
    var best=null, bestD=1e9, acts=allActors();
    for(var i=0;i<acts.length;i++){
      var e=acts[i];
      if(e===b||!e.alive||e.team===b.team) continue;
      if(!botSee(b,e)) continue;
      var dd=(e.x-b.x)*(e.x-b.x)+(e.y-b.y)*(e.y-b.y);
      if(dd<bestD){ bestD=dd; best=e; }
    }
    if(best){
      if(b.tgt!==best){ b.fireT=b.react; }
      b.tgt=best; b.st='engage'; b.seenT=G.t;
      b.lastSeen={x:best.x,y:best.y};
    } else if(b.tgt && G.t-b.seenT<3.4 && b.lastSeen){
      b.st='seek';
    } else { b.tgt=null; b.st='roam'; }
  }
  // ---- aiming -------------------------------------------------------------
  var wantAng=b.ang, moveSpd=3.0, tz=0.62;
  if(b.st==='engage'&&b.tgt){
    var tx=b.tgt.x, ty=b.tgt.y;
    tz = b.tgt.isPlayer ? (0.30+P.eye*0.55) : 0.62;
    wantAng=atan2(ty-b.y,tx-b.x);
    moveSpd = 1.9;
  } else if(b.st==='seek'&&b.lastSeen){
    wantAng=atan2(b.lastSeen.y-b.y,b.lastSeen.x-b.x);
    moveSpd=3.4;
  }
  // ---- pathing ------------------------------------------------------------
  b.pathT-=dt;
  if(b.pathT<=0){
    b.pathT=0.55+rnd()*0.5;
    var gx,gy;
    if(b.st==='engage'&&b.tgt){
      var dd2=sqrt((b.tgt.x-b.x)*(b.tgt.x-b.x)+(b.tgt.y-b.y)*(b.tgt.y-b.y));
      if(dd2>(d.cls==='SNIPER'?16:7)){ gx=b.tgt.x|0; gy=b.tgt.y|0; }
      else { gx=null; }
    } else if(b.st==='seek'&&b.lastSeen){ gx=b.lastSeen.x|0; gy=b.lastSeen.y|0; }
    else {
      if(!b.goal||((b.goal[0]-b.x)*(b.goal[0]-b.x)+(b.goal[1]-b.y)*(b.goal[1]-b.y))<2.2){
        var g2=pick(ROAM); b.goal=[g2[0]+0.5,g2[1]+0.5];
      }
      gx=b.goal[0]|0; gy=b.goal[1]|0;
    }
    if(gx!=null){ b.path=findPath(b.x,b.y,gx,gy); }
    else b.path=[];
  }
  // ---- movement -----------------------------------------------------------
  var mvx=0,mvy=0;
  if(b.path.length){
    var n=b.path[0];
    var dx=n[0]-b.x, dy=n[1]-b.y, dl=sqrt(dx*dx+dy*dy);
    if(dl<0.42){ b.path.shift(); }
    else { mvx=dx/dl; mvy=dy/dl; }
  }
  if(b.st==='engage'&&b.tgt){
    b.strafeT-=dt;
    if(b.strafeT<=0){ b.strafeT=rr(.6,1.7); if(rnd()<0.45) b.strafe*=-1; }
    var pa=wantAng+PI/2;
    mvx+=cos(pa)*b.strafe*0.85; mvy+=sin(pa)*b.strafe*0.85;
    var ml=sqrt(mvx*mvx+mvy*mvy)||1; mvx/=ml; mvy/=ml;
  }
  var spd=moveSpd*(0.85+b.skill*0.35);
  if(mvx||mvy){
    var pxo=b.x,pyo=b.y;
    moveEnt(b,mvx*spd*dt,mvy*spd*dt,b.radius);
    var moved=sqrt((b.x-pxo)*(b.x-pxo)+(b.y-pyo)*(b.y-pyo));
    b.walk+=moved*2.6;
    if(moved<0.0015&&b.path.length){ b.pathT=0; }
    if(b.st!=='engage') wantAng=atan2(mvy,mvx);
    b.walkPhase=(sin(b.walk)>0)?1:2;
    if(moved>0.001){
      b.stepT=(b.stepT||0)-moved;
      if(b.stepT<=0){ b.stepT=0.62; var dP=dist2P(b.x,b.y);
        if(dP<9) SND.step(clamp(1-dP/9,0,1)*0.7, panOf(b.x,b.y)); }
    }
  } else b.walkPhase=0;
  // turn
  var turn = (b.st==='engage'? 5.6+b.skill*4.4 : 3.4)*dt;
  b.ang += clamp(angDiff(wantAng,b.ang), -turn, turn);
  // ---- shooting -----------------------------------------------------------
  if(b.reload>0){ b.reload-=dt; if(b.reload<=0){ b.mag=d.mag; } }
  else if(b.st==='engage'&&b.tgt&&b.tgt.alive){
    b.fireT-=dt;
    var aimOff=abs(angDiff(atan2(b.tgt.y-b.y,b.tgt.x-b.x), b.ang));
    var distT=sqrt((b.tgt.x-b.x)*(b.tgt.x-b.x)+(b.tgt.y-b.y)*(b.tgt.y-b.y));
    if(b.fireT<=0 && aimOff<0.12+0.05*(1-b.skill) && distT<d.range+10){
      if(b.mag<=0){ b.reload=d.reload; SND.reload(1); }
      else{
        botFire(b, b.tgt.x, b.tgt.y, tz);
        if(d.auto){
          b.burst--;
          if(b.burst<=0){ b.burst=ri(3,7); b.fireT=rr(.28,.65)+ (1-b.skill)*0.25; }
          else b.fireT=d.rof;
        } else b.fireT=d.bolt+rr(.25,.7)+(1-b.skill)*0.5;
      }
    }
  } else if(b.mag<=0){ b.reload=d.reload; }
}
function dist2P(x,y){ var dx=x-P.x, dy=y-P.y; return sqrt(dx*dx+dy*dy); }
function panOf(x,y){
  var dx=x-P.x, dy=y-P.y;
  var rx = dx*cos(-P.ang)-dy*sin(-P.ang);
  var d=sqrt(dx*dx+dy*dy)||1;
  return clamp(rx/d*0.9,-1,1);
}
function volOf(x,y){ var d=dist2P(x,y); return clamp(1.35/(1+d*0.20),0,1); }
