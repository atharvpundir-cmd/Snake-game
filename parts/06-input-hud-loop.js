/* ============================================================================
   18. INPUT  (pointer lock + remappable keys)
   ============================================================================ */
var KEY={}, LOCKED=false, capturing=null;
var MOUSE={dx:0,dy:0,l:false,r:false};
function down(a){ return !!KEY[S.binds[a]]; }

document.addEventListener('keydown',function(e){
  if(capturing){
    e.preventDefault();
    if(e.code!=='Escape'){ S.binds[capturing]=e.code; saveSettings(); }
    var c=capturing; capturing=null; renderMenu(); SND.ui(1); return;
  }
  if(KEY[e.code]) { if(e.code==='Tab') e.preventDefault(); return; }
  KEY[e.code]=1;
  if(e.code==='Tab') e.preventDefault();
  if(e.code==='Escape'){ if(G.mode==='play') pause(); return; }
  if(G.mode!=='play') return;
  if(e.code===S.binds.reload) startReload();
  if(e.code===S.binds.swap) swapWeapon((P.cur+1)%P.weapons.length);
  if(e.code===S.binds.wpn1) swapWeapon(0);
  if(e.code===S.binds.wpn2) swapWeapon(1);
  if(e.code===S.binds.ks1) useStreak(0);
  if(e.code===S.binds.ks2) useStreak(1);
  if(e.code===S.binds.ks3) useStreak(2);
  if(e.code===S.binds.melee) melee();
  if(e.code===S.binds.score) D.board.classList.remove('hidden');
},false);
document.addEventListener('keyup',function(e){
  KEY[e.code]=0;
  if(e.code===S.binds.score) D.board.classList.add('hidden');
},false);
window.addEventListener('blur',function(){ KEY={}; MOUSE.l=MOUSE.r=false; });

view.addEventListener('mousedown',function(e){
  if(G.mode!=='play'){ return; }
  if(!LOCKED){ view.requestPointerLock(); return; }
  if(e.button===0) MOUSE.l=true;
  if(e.button===2){ MOUSE.r=true; if(!S.adsHold) toggleAds(); else setAds(1); }
});
document.addEventListener('mouseup',function(e){
  if(e.button===0) MOUSE.l=false;
  if(e.button===2){ MOUSE.r=false; if(S.adsHold) setAds(0); }
});
document.addEventListener('contextmenu',function(e){ e.preventDefault(); });
document.addEventListener('wheel',function(e){
  if(G.mode!=='play'||!LOCKED) return;
  swapWeapon((P.cur+(e.deltaY>0?1:P.weapons.length-1))%P.weapons.length);
},{passive:true});

document.addEventListener('pointerlockchange',function(){
  LOCKED = (document.pointerLockElement===view);
  if(!LOCKED && G.mode==='play' && !MOBILE) pause();
});
document.addEventListener('mousemove',function(e){
  if(!LOCKED||G.mode!=='play') return;
  var mult = S.sens*0.0022*lerp(1,S.adsSens,easeAds(P.ads));
  P.ang += e.movementX*mult;
  P.pitch += (S.invertY?1:-1)*e.movementY*mult*0.85;
  P.pitch = clamp(P.pitch,-PITCH_LIMIT,PITCH_LIMIT);
  if(P.ang>PI) P.ang-=TAU; if(P.ang<-PI) P.ang+=TAU;
  VM.swayX = clamp(VM.swayX - e.movementX*0.32, -46, 46);
  VM.swayY = clamp(VM.swayY - e.movementY*0.24, -34, 34);
});

/* ============================================================================
   19. WEAPON ACTIONS
   ============================================================================ */
function setAds(v){
  if(P.adsWant===v) return;
  P.adsWant=v; SND.ads(v>0.5);
}
function toggleAds(){ setAds(P.adsWant>0.5?0:1); }
function swapWeapon(i){
  if(i===P.cur||!P.alive) return;
  var w=W(); if(w.st==='reload'){ w.st='idle'; w.t=0; }
  w.st='swap'; w.t=0.30;
  P.pendingSwap=i; setAds(0); SND.swap();
}
function startReload(){
  var w=W();
  if(w.st!=='idle'||w.mag>=w.def.mag||w.reserve<=0||!P.alive) return;
  w.st='reload'; w.t=w.def.reload; w.reloadStage=0;
  setAds(0); SND.reload(0);
}
function finishReload(w){
  var need=w.def.mag-w.mag, take=min(need,w.reserve);
  w.mag+=take; w.reserve-=take; w.st='idle'; w.t=0;
}
function melee(){
  var w=W(); if(w.st!=='idle'||!P.alive) return;
  w.st='melee'; w.t=0.55; VM.kickA=-0.5;
  SND.swap();
  var acts=allActors();
  for(var i=0;i<acts.length;i++){
    var e=acts[i];
    if(e===P||!e.alive||e.team===P.team) continue;
    var dx=e.x-P.x, dy=e.y-P.y, d=sqrt(dx*dx+dy*dy);
    if(d<1.7 && abs(angDiff(atan2(dy,dx),P.ang))<0.9){
      bloodFX(e.x,e.y,0.8,dx/d,dy/d,true);
      damage(e,150,P,'KNIFE','body',d);
      break;
    }
  }
}
function fire(){
  var w=W(), d=w.def;
  if(!P.alive||w.st!=='idle'||w.t>0) return;
  if(w.mag<=0){ SND.ui(); startReload(); return; }
  w.mag--; P.shots++;
  w.t=d.rof;
  // --- spread: snipers snap to pinpoint past the quickscope threshold ---
  var sp;
  if(d.scope) sp = P.ads>0.52 ? d.adsSpread : lerp(d.hipSpread, d.hipSpread*0.5, P.ads);
  else sp = currentSpread(w);
  var yaw=P.ang+rr(-sp,sp), dz=Math.tan(P.pitch)+rr(-sp,sp);
  var dx=cos(yaw), dy=sin(yaw);
  var eyeZ=P.eye+P.z;
  var r=hitscan(P.x,P.y,eyeZ,dx,dy,dz,P,d.range+22,d.pierce);
  // --- feedback -----------------------------------------------------------
  SND.gunshot(d.snd,0,1);
  VM.flash=0.055; VM.flashA=1;
  VM.kick=d.kick; VM.kickA=-0.05-d.recoilV*0.5;
  P.recoilV += d.recoilV*(1-easeAds(P.ads)*0.35);
  P.recoilH += rr(-d.recoilH,d.recoilH);
  shakeAdd(d.cls==='SNIPER'?0.30:0.07);
  fxSpawn({x:P.x+dx*0.5,y:P.y+dy*0.5,z:eyeZ,life:0.05,spr:SPR.flash,size:0.22,add:1});
  addLight(P.x+dx*0.6, P.y+dy*0.6, eyeZ, 1.0,0.85,0.5,
           d.cls==='SNIPER'?3.0:1.9, d.cls==='SNIPER'?0.09:0.06);
  tracer(P.x+dx*0.7, P.y+dy*0.7, eyeZ-0.05, dx,dy,dz,
         min(r.wallD, d.range+22), true);
  // --- resolve hits -------------------------------------------------------
  var killedThisShot=0, hitAny=false, hs=false;
  for(var i=0;i<r.hits.length;i++){
    var h=r.hits[i];
    if(h.ent.team===P.team) break;
    var zone=zoneOf(h.z,h.hgt);
    var dmg=d.dmg*(zone==='head'?d.hsMul:zone==='leg'?d.legMul:1);
    if(h.d>d.range) dmg*=max(0.5,1-(h.d-d.range)*0.022);
    var full=(h.ent.hp>=h.ent.maxhp);
    bloodFX(h.ent.x,h.ent.y,h.z,dx,dy,dmg>60);
    hitAny=true; P.hits++;
    if(zone==='head'){ hs=true; P.hs++; }
    var died=damage(h.ent,dmg,P,wpnLabel(w),zone,h.d);
    if(died){ killedThisShot++;
      P.lastShotInfo={one:(d.scope&&full&&zone!=='leg'), dist:h.d, hs:zone==='head'}; }
  }
  if(hitAny){
    HITMARK.t=0.32; HITMARK.hs=hs; HITMARK.kill=killedThisShot>0;
    if(killedThisShot) SND.kill(); else if(hs) SND.headshot(); else SND.hitmark();
  }
  if(killedThisShot>=2) medal('COLLATERAL','DOUBLE PIERCE',50);
  if(!hitAny||r.hits.length<d.pierce){
    var wd=min(r.wallD,d.range+22);
    var hx=P.x+dx*wd, hy=P.y+dy*wd, hz=eyeZ+dz*wd;
    if(wd<d.range+22 && hz>0.02 && hz<2.4){
      impactFX(hx,hy,hz,-dx,-dy);
      SND.impact(panOf(hx,hy),volOf(hx,hy)*0.55, matOfTile(r.wall.tex));
    }
  }
  // bolt cycle
  if(d.bolt>0 && w.mag>0){
    w.st='bolt'; w.t=d.bolt; w.boltStage=0; VM.boltT=d.bolt;
  } else if(d.bolt>0 && w.mag<=0){
    w.st='idle';
  }
}

/* ============================================================================
   20. PLAYER UPDATE
   ============================================================================ */
function updatePlayer(dt){
  var w=W(), d=w.def;
  /* ---- death / respawn ---- */
  if(!P.alive){
    P.respawn-=dt;
    if(P.respawn<=0) respawnPlayer();
    P.ads=P.adsWant=0;
    return;
  }
  /* ---- ADS ---- */
  var adsSpeed=1/max(0.05,d.adsT);
  P.ads=approach(P.ads,P.adsWant,dt*adsSpeed);
  if(w.st==='reload'||w.st==='swap'||P.sprint>0.6) P.ads=approach(P.ads,0,dt*adsSpeed*1.4);
  /* ---- movement ---- */
  var fx2=0, fy2=0;
  var mf=(down('fwd')?1:0)-(down('back')?1:0);
  var ms=(down('right')?1:0)-(down('left')?1:0);
  if(TOUCH.on){ mf+=TOUCH.my; ms+=TOUCH.mx; }
  mf=clamp(mf,-1,1); ms=clamp(ms,-1,1);
  var wantSprint = (down('sprint')||TOUCH.sprint) && mf>0.4 && P.ads<0.2 && w.st!=='reload';
  P.sprint=approach(P.sprint, wantSprint?1:0, dt*(wantSprint?4:8));
  P.crouching = down('crouch')||!!TOUCH.crouch;
  P.crouchT=approach(P.crouchT, P.crouching?1:0, dt*7);
  P.eye = lerp(0.58, 0.34, P.crouchT);
  var base = 3.55*d.moveMul;
  var spd = base*lerp(1,1.52,P.sprint)*lerp(1,0.52,easeAds(P.ads))*lerp(1,0.55,P.crouchT);
  if(w.st==='reload') spd*=0.88;
  var len=sqrt(mf*mf+ms*ms);
  if(len>0){
    mf/=len; ms/=len;
    fx2 = cos(P.ang)*mf + cos(P.ang+PI/2)*ms;
    fy2 = sin(P.ang)*mf + sin(P.ang+PI/2)*ms;
  }
  var tvx=fx2*spd, tvy=fy2*spd;
  P.vx=lerp(P.vx,tvx,1-Math.pow(0.0009,dt));
  P.vy=lerp(P.vy,tvy,1-Math.pow(0.0009,dt));
  var oldx=P.x, oldy=P.y;
  moveEnt(P,P.vx*dt,P.vy*dt,P.radius);
  var moved=sqrt((P.x-oldx)*(P.x-oldx)+(P.y-oldy)*(P.y-oldy));
  /* ---- jump / vertical ---- */
  if((down('jump')||TOUCH.jump)&&P.z<=0.001&&P.vz===0){ P.vz=3.05;
    SND.step(0.5,0,surfOfFloor(P.x,P.y)); }
  TOUCH.jump=0;
  if(P.vz!==0||P.z>0){
    P.vz-=11.5*dt; P.z+=P.vz*dt;
    if(P.z<=0){ P.z=0; if(P.vz<-1.2) SND.step(0.8,0,surfOfFloor(P.x,P.y)); P.vz=0; }
  }
  /* ---- head bob + footsteps ---- */
  var speedFrac=moved/dt/max(0.1,base);
  P.bobT+=dt*(6.6+speedFrac*5.4);
  var bobAmt=speedFrac*(1-easeAds(P.ads)*0.7);
  P.bob=sin(P.bobT)*bobAmt*1.05;
  VM.bobX=sin(P.bobT*0.5)*bobAmt*11;
  VM.bobY=abs(sin(P.bobT))*bobAmt*8;
  if(moved>0.0008 && P.z<=0.001){
    P.stepT-=moved*(P.sprint>0.5?1.5:1);
    if(P.stepT<=0){ P.stepT=0.68;
      SND.step(0.55+P.sprint*0.3, rr(-0.15,0.15), surfOfFloor(P.x,P.y)); }
  }
  /* ---- recoil recovery ---- */
  P.pitch += P.recoilV*dt*14;
  P.ang   += P.recoilH*dt*10;
  P.recoilV=approach(P.recoilV,0,dt*(P.recoilV>0?2.2:6.0));
  P.recoilH=approach(P.recoilH,0,dt*2.0);
  P.pitch = clamp(P.pitch,-PITCH_LIMIT,PITCH_LIMIT);
  /* ---- weapon state machine ---- */
  if(w.t>0) w.t-=dt;
  if(w.st==='bolt'){
    VM.boltT=max(0,w.t);
    if(w.boltStage===0 && w.t<d.bolt*0.72){ w.boltStage=1; SND.bolt(0); }
    if(w.boltStage===1 && w.t<d.bolt*0.28){ w.boltStage=2; SND.bolt(1); }
    if(w.t<=0){ w.st='idle'; w.t=0; VM.boltT=0; }
  } else if(w.st==='reload'){
    var f=1-w.t/d.reload;
    if(w.reloadStage===0&&f>0.30){ w.reloadStage=1; SND.reload(1); }
    if(w.reloadStage===1&&f>0.72){ w.reloadStage=2; SND.reload(2); }
    if(w.t<=0) finishReload(w);
  } else if(w.st==='swap'){
    if(w.t<=0){ w.st='idle'; w.t=0; if(P.pendingSwap!=null){ P.cur=P.pendingSwap; P.pendingSwap=null;
      W().st='swap'; W().t=0.22; } }
  } else if(w.st==='melee'){
    if(w.t<=0){ w.st='idle'; w.t=0; }
  }
  /* ---- firing ---- */
  if(MOUSE.l && G.mode==='play'){
    if(d.auto) fire();
    else if(!P.firedThisClick){ fire(); P.firedThisClick=true; }
  }
  if(!MOUSE.l) P.firedThisClick=false;
  /* ---- auto-reload on empty ---- */
  if(w.mag<=0 && w.st==='idle' && w.reserve>0) startReload();
  /* ---- health regen ---- */
  if(G.t-P.lastHurt>4.2 && P.hp<P.maxhp) P.hp=min(P.maxhp,P.hp+dt*38);
  P.flinch=approach(P.flinch,0,dt*1.5);
  /* ---- viewmodel decay ---- */
  VM.swayX=lerp(VM.swayX,0,1-Math.pow(0.0015,dt));
  VM.swayY=lerp(VM.swayY,0,1-Math.pow(0.0015,dt));
  VM.kick=approach(VM.kick,0,dt*90);
  VM.kickA=approach(VM.kickA,0,dt*4.5);
  VM.flash=max(0,VM.flash-dt);
  VM.flashA=VM.flash>0?VM.flash/0.055:0;
  HITMARK.t=max(0,HITMARK.t-dt);
  /* ---- pickups ---- */
  updatePickupPrompt(dt);
}
function respawnPlayer(){
  var best=null,bd=-1;
  for(var i=0;i<SPAWN_F.length;i++){
    var s=SPAWN_F[i], m=1e9;
    for(var j=0;j<BOTS.length;j++){
      if(BOTS[j].team===P.team||!BOTS[j].alive) continue;
      var dd=(BOTS[j].x-s[0])*(BOTS[j].x-s[0])+(BOTS[j].y-s[1])*(BOTS[j].y-s[1]);
      if(dd<m) m=dd;
    }
    if(m>bd){ bd=m; best=s; }
  }
  P.x=best[0]+0.5+rr(-.3,.3); P.y=best[1]+0.5+rr(-.3,.3);
  P.ang=-PI/2; P.pitch=0; P.hp=P.maxhp; P.alive=true; P.vx=P.vy=0; P.z=0; P.vz=0;
  P.flinch=0; P.recoilV=P.recoilH=0;
  for(var k=0;k<P.weapons.length;k++){
    var w=P.weapons[k];
    w.mag=w.def.mag; w.reserve=w.def.reserve; w.st='idle'; w.t=0;
  }
  P.cur=0; setAds(0); D.vig.style.opacity=0;
  announce('');
}
/* ---- pickups ------------------------------------------------------------ */
var pickTarget=null, pickHold=0;
function updatePickupPrompt(dt){
  var best=null, bd=2.5;
  for(var i=0;i<PICKUPS.length;i++){
    var p=PICKUPS[i];
    p.life-=dt;
    if(p.life<=0){ PICKUPS.splice(i,1); i--; continue; }
    var dx=p.x-P.x, dy=p.y-P.y, d=sqrt(dx*dx+dy*dy);
    if(d<bd){ bd=d; best=p; }
  }
  if(best!==pickTarget){ pickHold=0; pickTarget=best; }
  if(pickTarget && P.alive){
    var def=WDEF[pickTarget.id];
    D.pick.classList.add('on');
    D.pickKey.textContent=keyLabel(S.binds.interact);
    D.pickTxt.textContent='for '+def.name+(def.attach?' '+def.attach:'');
    if(down('interact')||TOUCH.interact){
      pickHold+=dt;
      D.pickFill.style.width=clamp(pickHold/0.7,0,1)*100+'%';
      if(pickHold>=0.7){
        var slot = W().def.id===pickTarget.id ? P.cur : 1;
        P.weapons[slot]=mkWeapon(pickTarget.id);
        P.cur=slot; W().st='swap'; W().t=0.3;
        PICKUPS.splice(PICKUPS.indexOf(pickTarget),1);
        pickTarget=null; pickHold=0; SND.swap();
        D.pick.classList.remove('on'); D.pickFill.style.width='0%';
        announce('PICKED UP '+def.name);
      }
    } else { pickHold=0; D.pickFill.style.width='0%'; }
  } else {
    D.pick.classList.remove('on'); D.pickFill.style.width='0%';
  }
}

/* ============================================================================
   21. FEEDBACK: medals, killfeed, hit direction, announcements
   ============================================================================ */
function medal(title,sub,points){
  var m=el('div','medal', title+(sub?'<span class="sub">'+sub+'</span>':''));
  D.medals.appendChild(m);
  while(D.medals.children.length>3) D.medals.removeChild(D.medals.firstChild);
  setTimeout(function(){ m.classList.add('out');
    setTimeout(function(){ if(m.parentNode) m.parentNode.removeChild(m); },560); },1900);
  if(points) points_(points);
  SND.medal();
}
function points_(n,label){
  var p=el('div','pt','+'+n+(label?' <span style="font-size:.6em">'+label+'</span>':''));
  D.pts.appendChild(p);
  P.score+=n;
  setTimeout(function(){ if(p.parentNode) p.parentNode.removeChild(p); },1400);
  while(D.pts.children.length>4) D.pts.removeChild(D.pts.firstChild);
}
function nameHTML(a){
  if(!a) return '<span class="t-e">WORLD</span>';
  var cls = a.isPlayer?'t-me':(a.team===0?'t-f':'t-e');
  return '<span class="'+cls+'">'+(a.tag?'<b style="opacity:.7">'+a.tag+'</b>':'')+a.name+'</span>';
}
function killfeed(k,v,wname,hs){
  var row=el('div','kf'+((k&&k.isPlayer)||(v&&v.isPlayer)?' me':''));
  row.innerHTML = nameHTML(k)+' <span class="wp'+(hs?' hs':'')+'">'+wname+'</span> '+nameHTML(v);
  D.feed.appendChild(row);
  while(D.feed.children.length>5) D.feed.removeChild(D.feed.firstChild);
  setTimeout(function(){ row.classList.add('out');
    setTimeout(function(){ if(row.parentNode) row.parentNode.removeChild(row); },420); },6200);
}
function hitDirection(att){
  if(!att) return;
  var a=atan2(att.y-P.y, att.x-P.x)-P.ang;
  var e2=el('div','dind');
  e2.style.transform='rotate('+(a+PI/2)+'rad)';
  D.dirs.appendChild(e2);
  setTimeout(function(){ e2.style.transition='opacity .5s'; e2.style.opacity=0;
    setTimeout(function(){ if(e2.parentNode)e2.parentNode.removeChild(e2); },520); },520);
  D.vig.style.opacity=clamp(1-P.hp/100,0.25,1);
  clearTimeout(hitDirection._t);
  hitDirection._t=setTimeout(function(){ D.vig.style.opacity=0; },260);
}
function announce(txt){
  D.ann.textContent=txt;
  D.ann.classList.toggle('on',!!txt);
  if(txt){ clearTimeout(announce._t);
    announce._t=setTimeout(function(){ D.ann.classList.remove('on'); },2600); }
}
function showKilled(name,tag){
  D.killed.classList.add('on');
  D.killedName.innerHTML=(tag?'<b>'+tag+'</b> ':'')+name;
  clearTimeout(showKilled._t);
  showKilled._t=setTimeout(function(){ D.killed.classList.remove('on'); },2800);
}

/* ---- player kill / death hooks (called from damage()) ------------------- */
function playerKill(v,wname,zone,dist){
  var info=P.lastShotInfo||{};
  points_(100,'KILL');
  showKilled(v.name,v.tag);
  SND.kill();
  var now=G.t;
  if(now-P.lastKillT<4.5) P.comboKills++; else P.comboKills=1;
  P.lastKillT=now;
  if(!G.firstBlood){ G.firstBlood=true; medal('FIRST BLOOD','',50); }
  else if(zone==='head') medal('HEADSHOT','',50);
  else if(info.one && W().def.scope) medal('ONE SHOT, ONE KILL','',50);
  if(dist>21) medal('LONGSHOT','', 50);
  if(P.lastKilledBy===v.name){ medal('AVENGER','',50); P.lastKilledBy=null; }
  if(P.comboKills===2) medal('DOUBLE KILL','',100);
  else if(P.comboKills===3) medal('TRIPLE KILL','',150);
  else if(P.comboKills>3) medal('MULTI KILL x'+P.comboKills,'',200);
  checkStreaks();
}
function playerDied(k,wname){
  P.deaths++; P.streak=0; P.comboKills=0;
  D.vig.style.opacity=1;
  setTimeout(function(){ D.vig.style.opacity=0; },900);
  announce('KILLED BY '+(k?k.name:'THE WORLD'));
  P.respawn=5.0; P.deadT=0;
  MOUSE.l=false;
}

/* ============================================================================
   22. KILLSTREAKS
   ============================================================================ */
var STREAKS=[
  {name:'UAV', sub:'RECON', req:3, key:'3', ready:0, icon:'uav'},
  {name:'HUNTER KILLER', sub:'DRONE', req:5, key:'4', ready:0, icon:'hk'},
  {name:'LODESTAR', sub:'ORBITAL', req:7, key:'5', ready:0, icon:'ls'}
];
var drones=[];
function checkStreaks(){
  for(var i=0;i<STREAKS.length;i++){
    if(P.streak===STREAKS[i].req){
      STREAKS[i].ready++;
      announce(STREAKS[i].name+' READY  [ '+STREAKS[i].key+' ]');
      SND.streak();
      buildStreakCards();
    }
  }
}
function useStreak(i){
  var s=STREAKS[i];
  if(!s||!s.ready||!P.alive) return;
  s.ready--;
  buildStreakCards();
  if(i===0){ G.uav=32; SND.uav(); announce('UAV ONLINE'); }
  if(i===1){ launchHunter(); SND.jet(0); announce('HUNTER KILLER AWAY'); }
  if(i===2){ G.lodestar=5; G.lodestarT=0.6; SND.jet(0); announce('LODESTAR INBOUND'); }
}
function nearestEnemy(fx2,fy2){
  var best=null,bd=1e9;
  for(var i=0;i<BOTS.length;i++){
    var b=BOTS[i];
    if(!b.alive||b.team===P.team) continue;
    var d=(b.x-fx2)*(b.x-fx2)+(b.y-fy2)*(b.y-fy2);
    if(d<bd){ bd=d; best=b; }
  }
  return best;
}
function launchHunter(){
  var t=nearestEnemy(P.x,P.y);
  if(!t){ announce('NO TARGET'); return; }
  drones.push({x:P.x,y:P.y,z:1.7,t:t,life:6});
}
function updateStreaks(dt){
  if(G.uav>0) G.uav-=dt;
  D.mini.classList.toggle('uav', G.uav>0);
  for(var i=drones.length-1;i>=0;i--){
    var dr=drones[i]; dr.life-=dt;
    var tg=dr.t;
    if(!tg||!tg.alive){ tg=nearestEnemy(dr.x,dr.y); dr.t=tg; }
    if(!tg||dr.life<=0){ explode(dr.x,dr.y,dr.z,2.2,60,null); drones.splice(i,1); continue; }
    var dx=tg.x-dr.x, dy=tg.y-dr.y, dz=(0.7-dr.z);
    var d=sqrt(dx*dx+dy*dy)||1;
    var sp=9.5*dt;
    dr.x+=dx/d*sp; dr.y+=dy/d*sp; dr.z+=dz*dt*2.2;
    fxSpawn({x:dr.x,y:dr.y,z:dr.z,life:0.5,spr:SPR.smoke,size:0.22,a0:0.4,grow:0.3});
    if(d<0.8){ explode(dr.x,dr.y,dr.z,3.0,140,P); drones.splice(i,1); }
  }
  if(G.lodestar>0){
    G.lodestarT-=dt;
    if(G.lodestarT<=0){
      G.lodestarT=1.4; G.lodestar--;
      var t2=nearestEnemy(rr(4,MW-4),rr(4,MH-4));
      var tx = t2? t2.x+rr(-1.5,1.5) : rr(6,MW-6);
      var ty = t2? t2.y+rr(-1.5,1.5) : rr(6,MH-6);
      explode(tx,ty,0.4,3.4,130,P);
    }
  }
}
function explode(x,y,z,radius,dmg,owner){
  SND.explode(panOf(x,y), volOf(x,y));
  shakeAdd(clamp(1.6/(1+dist2P(x,y)*0.4),0,0.55));
  addLight(x,y,z+0.4, 1.0,0.55,0.18, 9, 0.5);
  for(var i=0;i<26;i++){
    var a=rnd()*TAU, sp=rr(1,7);
    fxSpawn({x:x,y:y,z:z+0.1, vx:cos(a)*sp, vy:sin(a)*sp, vz:rr(1,6),
      life:rr(.4,.9), spr:i%3?SPR.spark:SPR.debris, size:rr(.06,.2), grav:7, add:i%3?1:0});
  }
  for(var j=0;j<10;j++)
    fxSpawn({x:x+rr(-.6,.6),y:y+rr(-.6,.6),z:z+rr(0,1), life:rr(.9,1.7),
      spr:SPR.smoke, size:rr(.5,1.1), grow:1.1, a0:.55});
  var acts=allActors();
  for(var k=0;k<acts.length;k++){
    var e=acts[k];
    if(!e.alive) continue;
    var d=sqrt((e.x-x)*(e.x-x)+(e.y-y)*(e.y-y));
    if(d>radius) continue;
    if(owner&&e.team===owner.team&&e!==owner) continue;
    if(!losClear(x,y,e.x,e.y)) continue;
    damage(e, dmg*(1-d/radius*0.55), owner, 'LODESTAR', 'body', d);
  }
}

/* ============================================================================
   23. HUD
   ============================================================================ */
var lastHud={};
function buildStreakCards(){
  D.streaks.innerHTML='';
  for(var i=0;i<STREAKS.length;i++){
    var s=STREAKS[i];
    var c=el('div','ks'+(s.ready?' ready':''));
    var cv=document.createElement('canvas'); cv.width=cv.height=44;
    drawStreakIcon(cv.getContext('2d'), s.icon, s.ready?'#fff':'#7d8c99');
    var box=el('div','in');
    box.appendChild(cv);
    box.appendChild(el('div','tx','<b>'+s.name+'</b><s>'+(s.ready?'PRESS '+s.key:s.req+' KILLS')+'</s>'));
    c.appendChild(box);
    if(s.ready) c.appendChild(el('div','key',s.key));
    D.streaks.appendChild(c);
  }
}
function drawStreakIcon(g,kind,col){
  g.clearRect(0,0,44,44); g.strokeStyle=col; g.fillStyle=col; g.lineWidth=2.4;
  g.lineJoin='round';
  if(kind==='uav'){
    g.beginPath(); g.moveTo(6,26); g.lineTo(38,26); g.stroke();
    g.beginPath(); g.moveTo(22,26); g.lineTo(22,12); g.stroke();
    g.beginPath(); g.arc(22,10,3.4,0,TAU); g.fill();
    g.beginPath(); g.moveTo(12,34); g.lineTo(22,26); g.lineTo(32,34); g.stroke();
    g.globalAlpha=.5; g.beginPath(); g.arc(22,26,15,PI*0.15,PI*0.85); g.stroke(); g.globalAlpha=1;
  } else if(kind==='hk'){
    g.beginPath(); g.moveTo(8,22); g.lineTo(34,16); g.lineTo(34,28); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(34,22); g.lineTo(40,22); g.stroke();
    g.beginPath(); g.moveTo(14,22); g.lineTo(4,14); g.moveTo(14,22); g.lineTo(4,30); g.stroke();
  } else {
    g.beginPath(); g.arc(22,16,7,0,TAU); g.stroke();
    g.beginPath(); g.moveTo(22,23); g.lineTo(22,38); g.stroke();
    g.beginPath(); g.moveTo(14,38); g.lineTo(22,30); g.lineTo(30,38); g.stroke();
    g.globalAlpha=.55;
    g.beginPath(); g.moveTo(12,10); g.lineTo(32,10); g.stroke(); g.globalAlpha=1;
  }
}
function fmtTime(t){
  t=max(0,t|0);
  var m=(t/60)|0, s=t%60;
  return m+':'+(s<10?'0':'')+s;
}
function updateHUD(){
  var w=W();
  if(lastHud.mag!==w.mag){ D.mag.textContent=w.mag; lastHud.mag=w.mag;
    D.mag.classList.toggle('low', w.mag<=max(1,w.def.mag*0.25)); }
  if(lastHud.res!==w.reserve){ D.res.textContent='/'+w.reserve; lastHud.res=w.reserve; }
  var gn=wpnLabel(w);
  if(lastHud.gun!==gn){ D.gunName.textContent=gn; lastHud.gun=gn;
    D.fireMode.textContent=w.def.mode; }
  if(lastHud.sf!==G.score[0]){ D.sF.textContent=G.score[0]; lastHud.sf=G.score[0]; }
  if(lastHud.se!==G.score[1]){ D.sE.textContent=G.score[1]; lastHud.se=G.score[1]; }
  var tstr=fmtTime(G.timeLeft);
  if(lastHud.time!==tstr){ D.clock.textContent=tstr; lastHud.time=tstr;
    D.clock.classList.toggle('low',G.timeLeft<30); }
  // reload progress
  if(w.st==='reload'){
    D.reloadbar.style.opacity=1;
    D.reloadfill.style.width=((1-w.t/w.def.reload)*100)+'%';
  } else if(w.st==='bolt'){
    D.reloadbar.style.opacity=1;
    D.reloadfill.style.width=((1-w.t/w.def.bolt)*100)+'%';
  } else D.reloadbar.style.opacity=0;
  // low health
  D.lowhp.style.opacity = P.alive? clamp((1-P.hp/60),0,1)*0.9 : 0;
  // dead overlay
  if(!P.alive) announceRespawn();
}
function announceRespawn(){
  var s=Math.ceil(P.respawn);
  if(lastHud.rs!==s){ lastHud.rs=s; D.ann.textContent='RESPAWN IN '+s;
    D.ann.classList.add('on'); }
}
function updateScoreboard(){
  var rows=[{a:P}];
  for(var i=0;i<BOTS.length;i++) rows.push({a:BOTS[i]});
  rows.sort(function(x,y){ return (y.a.score||0)-(x.a.score||0); });
  var h='';
  for(var j=0;j<rows.length;j++){
    var a=rows[j].a;
    h+='<tr class="'+(a.team===0?'friend':'enemy')+(a.isPlayer?' you':'')+'">'+
       '<td>'+(a.tag?a.tag+' ':'')+a.name+'</td><td>'+(a.score||0)+'</td><td>'+(a.kills||0)+
       '</td><td>'+(a.deaths||0)+'</td><td>'+(a.best||0)+'</td></tr>';
  }
  D.boardBody.innerHTML=h;
}

/* ---- minimap ------------------------------------------------------------ */
var MMS=316;
function drawMinimap(){
  var g=mctx, R=MMS/2, scale=6.2;
  g.clearRect(0,0,MMS,MMS);
  g.save();
  g.beginPath();
  if(g.roundRect) g.roundRect(3,3,MMS-6,MMS-6,8); else g.rect(3,3,MMS-6,MMS-6);
  g.clip();
  g.fillStyle='rgba(10,20,28,.55)'; g.fillRect(0,0,MMS,MMS);
  g.translate(R,R);
  g.rotate(-P.ang-PI/2);
  g.translate(-P.x*scale,-P.y*scale);
  // walls
  var x0=max(0,(P.x-28)|0), x1=min(MW-1,(P.x+28)|0),
      y0=max(0,(P.y-28)|0), y1=min(MH-1,(P.y+28)|0);
  for(var y=y0;y<=y1;y++) for(var x=x0;x<=x1;x++){
    var t=MAP[idx(x,y)];
    if(!t) continue;
    g.fillStyle = t===2? 'rgba(120,190,225,.55)' :
                  (t===4||t===6)? 'rgba(150,150,150,.42)' : 'rgba(222,228,232,.72)';
    g.fillRect(x*scale,y*scale,scale,scale);
  }
  // pickups
  g.fillStyle='rgba(255,200,60,.9)';
  for(var pi=0;pi<PICKUPS.length;pi++)
    g.fillRect(PICKUPS[pi].x*scale-2,PICKUPS[pi].y*scale-2,4,4);
  // actors
  for(var i=0;i<BOTS.length;i++){
    var b=BOTS[i];
    if(!b.alive) continue;
    var friendly=(b.team===P.team);
    var visible = friendly || G.uav>0 || (G.t-(b.lastFire||-9)<1.4);
    if(!visible) continue;
    g.save(); g.translate(b.x*scale,b.y*scale); g.rotate(b.ang+PI/2);
    g.fillStyle=friendly?'#4fc3ff':'#ff4433';
    g.beginPath(); g.moveTo(0,-7); g.lineTo(5.5,6); g.lineTo(0,3); g.lineTo(-5.5,6); g.closePath(); g.fill();
    g.restore();
  }
  g.restore();
  // player arrow (always centre, pointing up)
  g.save(); g.translate(R,R);
  g.fillStyle='#ffffff'; g.strokeStyle='rgba(0,0,0,.55)'; g.lineWidth=2;
  g.beginPath(); g.moveTo(0,-9); g.lineTo(7,7); g.lineTo(0,3.5); g.lineTo(-7,7); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  // cardinal letters ride the rim
  g.fillStyle='rgba(255,255,255,.6)'; g.font='bold 17px "Segoe UI",Arial'; g.textAlign='center';
  var dirs=[['N',0],['E',PI/2],['S',PI],['W',-PI/2]];
  for(var k=0;k<4;k++){
    var a=dirs[k][1]-P.ang-PI/2;
    g.fillText(dirs[k][0], R+cos(a)*(R-20), R+sin(a)*(R-20)+6);
  }
}

/* ============================================================================
   24. MATCH FLOW
   ============================================================================ */
function checkMatchEnd(){
  if(G.mode!=='play') return;
  if(G.score[0]>=G.scoreLimit||G.score[1]>=G.scoreLimit) endMatch();
}
function endMatch(){
  G.mode='over';
  G.endWin = G.score[0]>=G.score[1];
  document.exitPointerLock&&document.exitPointerLock();
  D.hud.classList.remove('on');
  renderMenu('end');
  D.menu.style.display='flex';
  SND.medal();
}
function startMatch(){
  G.score=[0,0]; G.timeLeft=G.matchLen; G.mode='play'; G.uav=0; G.lodestar=0;
  G.firstBlood=false;
  FXS.length=0; PICKUPS.length=0; DECALS.length=0; drones.length=0;
  D.feed.innerHTML=''; D.medals.innerHTML=''; D.pts.innerHTML='';
  P.score=P.kills=P.deaths=P.streak=P.best=P.hits=P.shots=P.hs=0;
  P.comboKills=0; P.lastKillT=-99; P.lastKilledBy=null;
  P.weapons=[mkWeapon('ballista'), mkWeapon('msmc')]; P.cur=0;
  P.alive=true; P.hp=P.maxhp; P.ads=P.adsWant=0;
  for(var i=0;i<STREAKS.length;i++) STREAKS[i].ready=0;
  spawnTeams();
  assignTags();
  respawnPlayer();
  buildStreakCards();
  updateScoreboard();
  D.menu.style.display='none';
  D.hud.classList.add('on');
  if(!IS_TOUCH) view.requestPointerLock();
  announce('MATCH START');
}
function assignTags(){
  P.tag='[YOU]'; P.name='PLAYER';
  var tf=['[TF1]','[NVA]','[SOG]','[DJC]'], te=['[AMP]','[TGC]','[SEC]','[MRC]','[FOX]'];
  for(var i=0;i<BOTS.length;i++)
    BOTS[i].tag = BOTS[i].team===0 ? tf[i%tf.length] : te[i%te.length];
}
function pause(){
  if(G.mode!=='play') return;
  G.mode='paused';
  document.exitPointerLock&&document.exitPointerLock();
  MOUSE.l=MOUSE.r=false; KEY={};
  renderMenu('pause');
  D.menu.style.display='flex';
}
function resume(){
  G.mode='play';
  D.menu.style.display='none';
  if(!IS_TOUCH) view.requestPointerLock();
}

/* ============================================================================
   25. MENUS
   ============================================================================ */
var menuPage='main';
function renderMenu(page){
  if(page) menuPage=page;
  var h='';
  if(menuPage==='main'||menuPage==='pause'){
    h+='<div class="hd"><h1>BLACK <em>OPS</em>: ARENA</h1>'+
       '<div class="sub">TEAM DEATHMATCH &middot; RAID &middot; '+G.scoreLimit+' KILLS</div></div><div class="bd">';
    if(menuPage==='pause'){
      h+='<button class="btn" data-a="resume">RESUME<small>Return to the match</small></button>';
      h+='<button class="btn" data-a="restart">RESTART MATCH<small>Reset scores and respawn everyone</small></button>';
    } else {
      h+='<button class="btn" data-a="start">DEPLOY<small>Ballista bolt-action + MSMC secondary</small></button>';
    }
    h+='<button class="btn" data-a="settings">CONTROLS &amp; SETTINGS<small>Remap keys, sensitivity, field of view, quality</small></button>';
    h+='<div class="sect">BRIEFING</div><div class="tip">'+
       '<kbd>MOUSE</kbd> look &middot; <kbd>LMB</kbd> fire &middot; <kbd>RMB</kbd> toggle ADS &middot; '+
       '<kbd>'+keyLabel(S.binds.reload)+'</kbd> reload &middot; <kbd>'+keyLabel(S.binds.interact)+'</kbd> pick up<br>'+
       '<kbd>1</kbd>/<kbd>2</kbd> weapons &middot; <kbd>3</kbd><kbd>4</kbd><kbd>5</kbd> killstreaks &middot; '+
       '<kbd>'+keyLabel(S.binds.score)+'</kbd> scoreboard &middot; <kbd>ESC</kbd> pause<br>'+
       'Quickscope: fire the instant the scope settles &mdash; snipers go pinpoint past half ADS.</div>';
    h+='</div>';
  } else if(menuPage==='settings'){
    h+='<div class="hd"><h1>SETTINGS</h1><div class="sub">CONTROLS &middot; MOUSE &middot; VIDEO</div></div><div class="bd">';
    h+='<div class="sect">KEY BINDINGS</div><div class="grid2">';
    for(var k in BIND_LABELS){
      h+='<div class="row"><span>'+BIND_LABELS[k]+'</span>'+
         '<div class="keyb'+(capturing===k?' wait':'')+'" data-bind="'+k+'">'+
         (capturing===k?'PRESS KEY':keyLabel(S.binds[k]))+'</div></div>';
    }
    h+='</div><div class="sect">MOUSE</div>';
    h+=rowRange('Sensitivity','sens',0.2,3,0.05);
    h+=rowRange('ADS Sensitivity','adsSens',0.2,1.5,0.05);
    h+='<div class="row"><span>Invert Look</span><div class="keyb" data-tog="invertY">'+(S.invertY?'ON':'OFF')+'</div></div>';
    h+='<div class="row"><span>ADS Mode</span><div class="keyb" data-tog="adsHold">'+(S.adsHold?'HOLD':'TOGGLE')+'</div></div>';
    if(IS_TOUCH){
      h+='<div class="sect">TOUCH</div>';
      h+=rowRange('Look Sensitivity','touchSens',0.3,2.5,0.05);
      h+='<div class="row"><span>Left-handed Layout</span><div class="keyb" data-tog="leftHanded">'+
         (S.leftHanded?'ON':'OFF')+'</div></div>';
    }
    h+='<div class="sect">VIDEO &amp; AUDIO</div>';
    h+=rowRange('Field of View','fov',60,110,1);
    h+=rowRange('Resolution Scale','res',0.32,1.0,0.02);
    h+=rowRange('Bloom','bloom',0,1.2,0.05);
    h+='<div class="row"><span>Film Grain</span><div class="keyb" data-tog="grain">'+(S.grain?'ON':'OFF')+'</div></div>';
    h+='<div class="row"><span>Sun Flare</span><div class="keyb" data-tog="flare">'+(S.flare?'ON':'OFF')+'</div></div>';
    h+=rowRange('Screen Shake','shake',0,1.6,0.1);
    h+=rowRange('Volume','sfx',0,1,0.05);
    h+='<div style="margin-top:18px;display:flex;gap:10px">'+
       '<button class="btn sm" data-a="back">BACK</button>'+
       '<button class="btn sm" data-a="defaults">RESET DEFAULTS</button></div>';
    h+='</div>';
  } else if(menuPage==='end'){
    var win=G.endWin;
    h+='<div class="hd"><div id="endTitle" class="'+(win?'win':'lose')+'">'+(win?'VICTORY':'DEFEAT')+'</div>'+
       '<div class="sub" style="text-align:center">'+G.score[0]+' &ndash; '+G.score[1]+' &middot; RAID</div></div><div class="bd">';
    var acc = P.shots? Math.round(P.hits/P.shots*100):0;
    h+='<div class="stats"><div><b>'+P.kills+'</b><s>KILLS</s></div>'+
       '<div><b>'+P.deaths+'</b><s>DEATHS</s></div>'+
       '<div><b>'+(P.deaths?(P.kills/P.deaths).toFixed(2):P.kills.toFixed(2))+'</b><s>K/D</s></div>'+
       '<div><b>'+acc+'%</b><s>ACCURACY</s></div></div>';
    h+='<div class="stats" style="grid-template-columns:repeat(3,1fr)">'+
       '<div><b>'+P.score+'</b><s>SCORE</s></div>'+
       '<div><b>'+P.best+'</b><s>BEST STREAK</s></div>'+
       '<div><b>'+P.hs+'</b><s>HEADSHOTS</s></div></div>';
    h+='<button class="btn" data-a="start" style="margin-top:18px">PLAY AGAIN</button>';
    h+='<button class="btn" data-a="settings">SETTINGS</button></div>';
  }
  D.panel.innerHTML=h;
}
function rowRange(label,key,mn,mx,st){
  var v=S[key];
  var disp = key==='res'? Math.round(v*100)+'%' : (key==='fov'? Math.round(v) : v.toFixed(2));
  return '<div class="row"><span>'+label+'</span><div style="display:flex;align-items:center;gap:10px">'+
    '<input type="range" min="'+mn+'" max="'+mx+'" step="'+st+'" value="'+v+'" data-set="'+key+'">'+
    '<b style="min-width:52px;text-align:right;font-size:11.5px">'+disp+'</b></div></div>';
}
D.panel.addEventListener('click',function(e){
  var t=e.target.closest('[data-a],[data-bind],[data-tog]');
  if(!t) return;
  var a=t.getAttribute('data-a');
  if(a){
    SND.ui();
    if(a==='start'){ audioInit(); startMatch(); }
    else if(a==='resume') resume();
    else if(a==='restart'){ startMatch(); }
    else if(a==='settings') renderMenu('settings');
    else if(a==='back') renderMenu(G.mode==='play'||G.mode==='paused'?'pause':'main');
    else if(a==='defaults'){
      for(var k in DEFAULT_BINDS) S.binds[k]=DEFAULT_BINDS[k];
      S.sens=1; S.adsSens=.55; S.fov=75; S.res=.62; S.shake=1; S.sfx=.8;
      S.invertY=0; S.adsHold=0; saveSettings(); resizeRender(); renderMenu();
    }
    return;
  }
  var b=t.getAttribute('data-bind');
  if(b){ capturing=b; renderMenu(); return; }
  var tg=t.getAttribute('data-tog');
  if(tg){ S[tg]=S[tg]?0:1; saveSettings();
    if(tg==='leftHanded') D.touch.classList.toggle('lefty',!!S.leftHanded);
    renderMenu(); }
});
D.panel.addEventListener('input',function(e){
  var k=e.target.getAttribute&&e.target.getAttribute('data-set');
  if(!k) return;
  S[k]=parseFloat(e.target.value);
  if(k==='sfx'&&MASTER) MASTER.gain.value=S.sfx;
  if(k==='res') resizeRender();
  saveSettings();
  var b=e.target.parentNode.querySelector('b');
  if(b) b.textContent = k==='res'? Math.round(S[k]*100)+'%' : (k==='fov'? Math.round(S[k]) : S[k].toFixed(2));
});

/* ============================================================================
   26. MAIN LOOP
   ============================================================================ */
var lastT=0, acc=0, fpsT=0, frames=0;
function step(dt){
  G.t+=dt;
  if(G.mode==='play'){
    G.timeLeft-=dt;
    if(G.timeLeft<=0){ G.timeLeft=0; endMatch(); return; }
    updatePlayer(dt);
    for(var i=0;i<BOTS.length;i++) updateBot(BOTS[i],dt);
    updateStreaks(dt);
  }
  updateFX(dt);
  updateLights(dt);
  // ambient dust drifting in the sunlight
  if(G.mode==='play' && rnd()<dt*9)
    fxSpawn({x:P.x+rr(-7,7), y:P.y+rr(-7,7), z:rr(0.15,2.4),
      vx:rr(-.09,.09), vy:rr(-.09,.09), vz:rr(-.02,.05),
      life:rr(2,4.5), spr:SPR.spark, size:rr(.008,.02), add:1, a0:0.45});
  VOICES=max(0,VOICES-dt*26);       // release the audio voice budget
  // shake decay
  SHAKE.m=approach(SHAKE.m,0,dt*2.4);
  SHAKE.x=(rnd()-0.5)*SHAKE.m*0.9;
  SHAKE.y=(rnd()-0.5)*SHAKE.m*0.9;
  if(!P.alive) P.deadT=(P.deadT||0)+dt;
}
function frame(ts){
  requestAnimationFrame(frame);
  if(!lastT) lastT=ts;
  var dt=min(0.05,(ts-lastT)/1000); lastT=ts;
  if(G.mode==='play'||G.mode==='over'||G.mode==='paused'){
    acc+=dt;
    var guard=0;
    while(acc>=1/120 && guard++<8){ step(1/120); acc-=1/120; }
  }
  render3D();
  drawOverlay(dt);
  if(G.mode==='play'||G.mode==='paused'){
    updateHUD();
    drawMinimap();
    if(!D.board.classList.contains('hidden')) updateScoreboard();
  }
}

/* ============================================================================
   27. TOUCH CONTROLS  (phones / tablets)
   ============================================================================
   Left half  = movement stick with a floating origin.
   Right half = drag to look (full 3D, pitch included).
   Buttons sit above both zones and swallow their own touches.            */
var TOUCH={ on:0, mx:0, my:0, sprint:0, jump:0, crouch:0, interact:0,
            stickId:null, ox:0, oy:0, lookId:null, lx:0, ly:0 };
var STICK_R=64;

function touchInit(){
  if(!IS_TOUCH) return;
  D.touch.classList.add('on');
  document.body.classList.add('touch');
  if(S.leftHanded) D.touch.classList.add('lefty');

  var stickBase=$('stickBase'), stickKnob=$('stickKnob');

  function zoneOfTouch(t){
    var half=window.innerWidth*0.5;
    var leftSide = t.clientX < half;
    return (S.leftHanded ? !leftSide : leftSide) ? 'move' : 'look';
  }
  function onStart(e){
    if(G.mode!=='play') return;
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      if(zoneOfTouch(t)==='move'){
        if(TOUCH.stickId!==null) continue;
        TOUCH.stickId=t.identifier; TOUCH.ox=t.clientX; TOUCH.oy=t.clientY; TOUCH.on=1;
        stickBase.style.left=t.clientX+'px'; stickBase.style.top=t.clientY+'px';
        stickBase.style.opacity=1; stickKnob.style.transform='translate(-50%,-50%)';
      } else {
        if(TOUCH.lookId!==null) continue;
        TOUCH.lookId=t.identifier; TOUCH.lx=t.clientX; TOUCH.ly=t.clientY;
      }
    }
    e.preventDefault();
  }
  function onMove(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      if(t.identifier===TOUCH.stickId){
        var dx=t.clientX-TOUCH.ox, dy=t.clientY-TOUCH.oy;
        var len=sqrt(dx*dx+dy*dy);
        if(len>STICK_R){ dx*=STICK_R/len; dy*=STICK_R/len; len=STICK_R; }
        TOUCH.mx=dx/STICK_R; TOUCH.my=-dy/STICK_R;
        TOUCH.sprint = (len/STICK_R>0.86 && TOUCH.my>0.5) ? 1 : 0;
        stickKnob.style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';
      } else if(t.identifier===TOUCH.lookId){
        var mult=S.touchSens*0.0034*lerp(1,S.adsSens,easeAds(P.ads));
        P.ang += (t.clientX-TOUCH.lx)*mult;
        P.pitch += (S.invertY?1:-1)*(t.clientY-TOUCH.ly)*mult*0.9;
        P.pitch = clamp(P.pitch,-PITCH_LIMIT,PITCH_LIMIT);
        if(P.ang>PI) P.ang-=TAU; if(P.ang<-PI) P.ang+=TAU;
        TOUCH.lx=t.clientX; TOUCH.ly=t.clientY;
      }
    }
    e.preventDefault();
  }
  function onEnd(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      if(t.identifier===TOUCH.stickId){
        TOUCH.stickId=null; TOUCH.mx=TOUCH.my=0; TOUCH.on=0; TOUCH.sprint=0;
        stickBase.style.opacity=0;
      } else if(t.identifier===TOUCH.lookId){ TOUCH.lookId=null; }
    }
  }
  var zone=D.touch;
  zone.addEventListener('touchstart',onStart,{passive:false});
  zone.addEventListener('touchmove',onMove,{passive:false});
  zone.addEventListener('touchend',onEnd,{passive:false});
  zone.addEventListener('touchcancel',onEnd,{passive:false});

  /* ---- action buttons ---- */
  function btn(id,onDown,onUp){
    var b=$(id); if(!b) return;
    b.addEventListener('touchstart',function(e){
      e.preventDefault(); e.stopPropagation();
      b.classList.add('down'); if(G.mode==='play') onDown();
    },{passive:false});
    var up=function(e){ e.preventDefault(); e.stopPropagation();
      b.classList.remove('down'); if(onUp) onUp(); };
    b.addEventListener('touchend',up,{passive:false});
    b.addEventListener('touchcancel',up,{passive:false});
  }
  btn('bFire', function(){ MOUSE.l=true; }, function(){ MOUSE.l=false; });
  btn('bAds',  function(){ toggleAds(); });
  btn('bReload',function(){ startReload(); });
  btn('bJump', function(){ TOUCH.jump=1; });
  btn('bCrouch',function(){ TOUCH.crouch=TOUCH.crouch?0:1;
    $('bCrouch').classList.toggle('active',!!TOUCH.crouch); });
  btn('bSwap', function(){ swapWeapon((P.cur+1)%P.weapons.length); });
  btn('bUse',  function(){ TOUCH.interact=1; }, function(){ TOUCH.interact=0; });
  btn('bMelee',function(){ melee(); });
  btn('bMenu', function(){ pause(); });

  // tapping a ready killstreak card calls it in
  D.streaks.addEventListener('touchstart',function(e){
    var card=e.target.closest('.ks');
    if(!card||!card.classList.contains('ready')) return;
    e.preventDefault(); e.stopPropagation();
    useStreak([].indexOf.call(D.streaks.children,card));
  },{passive:false});

  // keep the page from scrolling / zooming under the game
  document.addEventListener('touchmove',function(e){
    if(G.mode==='play') e.preventDefault();
  },{passive:false});
  document.addEventListener('gesturestart',function(e){ e.preventDefault(); });
  window.addEventListener('orientationchange',function(){
    setTimeout(function(){ resizeRender(); checkOrientation(); },260);
  });
  checkOrientation();
}
function checkOrientation(){
  if(!MOBILE) return;
  var portrait = window.innerHeight > window.innerWidth;
  D.rotate.classList.toggle('on', portrait);
}
window.addEventListener('resize',checkOrientation);

/* ============================================================================
   28. BOOT
   ============================================================================ */
function boot(){
  buildTextures();
  buildSky();
  buildMap();
  buildSprites();
  initRenderExtras();
  resizeRender();
  spawnTeams();
  assignTags();
  buildStreakCards();
  updateScoreboard();
  touchInit();
  renderMenu('main');
  D.loading.style.display='none';
  D.menu.style.display='flex';
  // idle camera so the menu has a live backdrop
  P.x=28.5; P.y=36.5; P.ang=-PI/2;
  requestAnimationFrame(frame);
}
setTimeout(boot,30);
})();
</script>
