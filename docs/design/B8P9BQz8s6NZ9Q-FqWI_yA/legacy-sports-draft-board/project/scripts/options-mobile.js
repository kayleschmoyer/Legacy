/* Renderers for the small-viewport board options. Every DOM lookup is
   guarded so each option page renders only its own prototype. */
const TEAMS=[['Bronx Bombers','BB',0],['Sandlot Swingers','SW',0],['Chi-Town','CT',0],['Dead Ball Legends','DL',0],['Fenway Faithful','FF',0],['Sandlot Dreamers','SD',1],['Iron Horse Club','IH',0],['Pinstripe Legacy','PL',0],['Old Ball Game','OB',0],['Splendid Swings','SPS',0],['Cooperstown FC','CF',0],['Golden Era','GE',0]];
const P=(name,pos,club,yrs,sv,sl,rank)=>({name,pos,club,yrs,sv,sl,rank});
const ROUNDS=[
 {r:1,nums:['1.01','1.02','1.03','1.04','1.05','1.06','1.07','1.08','1.09','1.10','1.11','1.12'],picks:[
  P('Babe Ruth','OF','NYY','1914–35','714','HR',1),P('Barry Bonds','OF','SFG','1986–07','762','HR',2),
  P('Willie Mays','OF','SFG','1951–73','660','HR',3),P('Ted Williams','OF','BOS','1939–60','.344','AVG',5),
  P('Cy Young','P','CLE','1890–11','511','W',8),P('Yogi Berra','C','NYY','1946–65','358','HR',14),
  P('Roger Clemens','P','BOS','1984–07','354','W',9),P('Alex Rodriguez','3B','NYY','1994–16','696','HR',7),
  P('Mickey Mantle','OF','NYY','1951–68','536','HR',6),P('Randy Johnson','P','ARI','1988–09','4,875','K',12),
  P('Cal Ripken Jr.','SS','BAL','1981–01','3,184','H',15),P('Joe DiMaggio','OF','NYY','1936–51','.325','AVG',11)]},
 {r:2,nums:['2.24','2.23','2.22','2.21','2.20','2.19','2.18','2.17','2.16','2.15','2.14','2.13'],picks:[
  P('Frank Robinson','OF','BAL','1956–76','586','HR',13),P('Tom Seaver','P','NYM','1967–86','311','W',18),
  P('Nolan Ryan','P','HOU','1966–93','5,714','K',10),P('Rickey Henderson','OF','OAK','1979–03','1,406','SB',16),
  P('Mike Trout','OF','LAA','2011–','.301','AVG',20),P('Pedro Martínez','P','BOS','1992–09','2.93','ERA',17),
  P('Sandy Koufax','P','LAD','1955–66','2.76','ERA',22),P('Ken Griffey Jr.','OF','SEA','1989–10','630','HR',19),
  P('Warren Spahn','P','MIL','1942–65','363','W',26),P('Tris Speaker','OF','CLE','1907–28','.345','AVG',30),
  P('Eddie Mathews','3B','MIL','1952–68','512','HR',28),P('Derek Jeter','SS','NYY','1995–14','3,465','H',21)]},
 {r:3,nums:['3.25','3.26','3.27','3.28','3.29','3.30','3.31','3.32','3.33','3.34','3.35','3.36'],picks:[
  P('Walter Johnson','P','WSH','1907–27','417','W',4),P('Christy Mathewson','P','NYG','1900–16','373','W',33),
  P('Mel Ott','OF','NYG','1926–47','511','HR',29),P('Jackie Robinson','2B','BRO','1947–56','.311','AVG',31),
  P('Stan Musial','OF','STL','1941–63','475','HR',23),P('Honus Wagner','SS','PIT','1897–17','.328','AVG',24),
  P('Ozzie Smith','SS','STL','1978–96','580','SB',44),P('Albert Pujols','1B','STL','2001–22','703','HR',27),
  P('Bob Gibson','P','STL','1959–75','2.91','ERA',35),P('Roberto Clemente','OF','PIT','1955–72','3,000','H',32),
  P('Carl Yastrzemski','OF','BOS','1961–83','452','HR',40),P('Johnny Bench','C','CIN','1967–83','389','HR',34)]},
 {r:4,nums:['4.37','4.38','4.39','4.40','4.41','4.42','4.43','4.44','4.45','4.46','4.47','4.48'],picks:[
  P('Rod Carew','2B','MIN','1967–85','.328','AVG',36),P('Tony Gwynn','OF','SDP','1982–01','.338','AVG',38),
  P('George Brett','3B','KCR','1973–93','3,154','H',37),P('Wade Boggs','3B','BOS','1982–99','.328','AVG',42),
  P('Tony Pérez','1B','CIN','1964–86','379','HR',52),null,null,null,null,null,null,null]}
];
const overall=n=>parseInt(n.split('.')[1],10);
const val=(pk,num)=>overall(num)-pk.rank;
function chip(v){const a=Math.abs(v);if(a<4)return '';return '<span class="chip '+(v>0?'steal':'reach')+'">'+(v>0?'+':'−')+a+'</span>'}

/* A — pick feed, newest round first */
function renderFeed(root){
  let h='';
  [...ROUNDS].reverse().forEach(rd=>{
    const made=rd.picks.filter(Boolean).length;
    h+='<div class="rhd"><span class="r">Round '+rd.r+'</span><span class="c">'+(made<12?made+' of 12 picks':'12 picks')+'</span></div>';
    const order=rd.r===4?[0,1,2,3,4,5,6,7]:[...Array(12).keys()].reverse();
    order.forEach(i=>{
      const pk=rd.picks[i],num=rd.nums[i],t=TEAMS[i];
      if(!pk){
        if(rd.r===4&&i===5){h+='<div class="pick now"><div class="n">'+num.split('.')[1]+'<b>▸</b></div><div><div class="nm">On the clock — your pick</div><div class="mt">Sandlot Dreamers · 3 players queued</div></div><div class="rt"><span class="chip flat">0:47</span></div></div>';}
        else h+='<div class="pick up"><div class="n">'+num.split('.')[1]+'</div><div><div class="nm">Upcoming</div><div class="mt">'+t[0]+'</div></div><div class="rt"></div></div>';
        return;
      }
      h+='<div class="pick'+(t[2]?' me':'')+'" data-pos="'+pk.pos+'">'
       +'<div class="n">#<b>'+overall(num)+'</b></div>'
       +'<div><div class="nm">'+pk.name+'</div>'
       +'<div class="mt"><span class="pos p-'+pk.pos+'">'+pk.pos+'</span> · '+pk.club+' · '+pk.yrs+'</div>'
       +'<div class="own">'+(t[2]?'★ ':'')+t[0].toUpperCase()+'</div></div>'
       +'<div class="rt">'+chip(val(pk,num))+'<span class="stat">'+pk.sv+'<small>'+pk.sl+'</small></span></div></div>';
    });
  });
  root.innerHTML=h;
}

/* B — team pager */
const SLOTS=['C','1B','2B','3B','SS','OF','OF','OF','P','P','P'];
function teamPicks(i){return ROUNDS.map(rd=>rd.picks[i]?{pk:rd.picks[i],num:rd.nums[i]}:null).filter(Boolean)}
function renderTeam(i,root){
  const t=TEAMS[i],got=teamPicks(i);
  let net=0;got.forEach(g=>net+=val(g.pk,g.num));
  const covered={};got.forEach(g=>covered[g.pk.pos]=(covered[g.pk.pos]||0)+1);
  const groups=[['C',1],['1B',1],['2B',1],['3B',1],['SS',1],['OF',3],['P',9]];
  let bars='';groups.forEach(([g,need])=>{const have=covered[g]||0;bars+='<div class="'+(have>=need?'f':(have?'':'n'))+'"><i></i>'+g+'</div>'});
  let rows='';
  got.forEach(g=>{
    rows+='<div class="r"><div class="sl pos p-'+g.pk.pos+'">'+g.pk.pos+'</div>'
      +'<div><div class="nm">'+g.pk.name+'</div><div class="mt">'+g.pk.club+' · '+g.pk.yrs+' · pick #'+overall(g.num)+'</div></div>'
      +'<div class="rt"><div class="stat">'+g.pk.sv+'<small>'+g.pk.sl+'</small></div>'+chip(val(g.pk,g.num))+'</div></div>';
  });
  if(t[2])rows+='<div class="r next"><div class="sl" style="color:var(--gold)">▸</div><div><div class="nm" style="color:var(--gold);font-family:var(--f-body);font-style:italic;font-weight:400;font-size:13px">On the clock — pick #42</div><div class="mt">Lou Gehrig queued first · 0:47 left</div></div><div class="rt"><span class="chip flat">NOW</span></div></div>';
  const need=[['C',1],['1B',1],['2B',1],['3B',1],['SS',1],['OF',3],['P',9]];
  let open=[];need.forEach(([g,n])=>{for(let k=(covered[g]||0);k<n;k++)open.push(g)});
  open.slice(0,8).forEach(s=>{rows+='<div class="r open"><div class="sl">'+s+'</div><div><div class="nm">open slot</div></div><div class="rt"></div></div>'});
  root.innerHTML='<div class="teamhd"><div class="nm">'+(t[2]?'★ ':'')+t[0]+'</div><div class="sub">'+got.length+' of 23 slots filled · next pick #'+(t[2]?42:42+Math.abs(6-i))+'</div><div class="bars">'+bars+'</div></div>'
    +'<div class="roster">'+rows+'</div>'
    +'<div class="tfoot"><span>Net draft value</span><b style="color:'+(net>0?'var(--success)':net<0?'var(--seam-bright)':'var(--text-mute)')+'">'+(net>0?'+':'')+net+'</b></div>';
}
function buildPager(){
  const bar=document.querySelector('[data-pager]'),pane=document.querySelector('[data-render="b"]');
  if(!bar||!pane)return;
  bar.innerHTML=TEAMS.map((t,i)=>'<button data-i="'+i+'"'+(t[2]?' class="active"':'')+'>'+(t[2]?'★ ':'')+t[1]+'</button>').join('');
  bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    renderTeam(+b.dataset.i,pane);pane.scrollTop=0;
  }));
  renderTeam(5,pane);
}

/* C — pocket grid */
function renderMini(root){
  const tbl=root.querySelector('.tbl');
  let h='<div class="th" style="background:transparent;border-color:transparent"></div>';
  TEAMS.forEach(t=>h+='<div class="th'+(t[2]?' me':'')+'">'+(t[2]?'★ ':'')+t[1]+'</div>');
  ROUNDS.forEach(rd=>{
    h+='<div class="rlab">R'+rd.r+'</div>';
    rd.picks.forEach((pk,i)=>{
      const num=rd.nums[i],t=TEAMS[i];
      if(!pk){
        if(rd.r===4&&i===5)h+='<div class="c now"><div class="n"><span>'+num+'</span><span>0:47</span></div><div class="nm">On the clock</div><div class="mt"><b>YOU</b><span>3 queued</span></div></div>';
        else h+='<div class="c empty"><div class="n"><span>'+num+'</span></div></div>';
        return;
      }
      const v=val(pk,num),vc=v>=4?'var(--success)':v<=-4?'var(--seam-bright)':'var(--text-mute)';
      h+='<div class="c'+(t[2]?' me':'')+'" data-pos="'+pk.pos+'"><div class="n"><span>'+num+'</span><span style="color:'+vc+'">'+(v>0?'+'+v:v<0?v:'—')+'</span></div>'
       +'<div class="nm">'+pk.name+'</div>'
       +'<div class="mt"><b class="pos p-'+pk.pos+'">'+pk.pos+'</b><span>'+pk.sv+' '+pk.sl+'</span></div></div>';
    });
  });
  for(let r=5;r<=8;r++){
    h+='<div class="rlab">R'+r+'</div>';
    for(let i=0;i<12;i++){const n=r+'.'+String((r-1)*12+i+1).padStart(2,'0');h+='<div class="c empty"><div class="n"><span>'+n+'</span></div></div>';}
  }
  h+='<div class="rlab"></div><div class="c empty" style="grid-column:2 / span 12;align-items:flex-start;justify-content:center;min-height:40px"><div class="mt" style="position:sticky;left:0;width:340px;font-family:var(--f-body);font-style:italic;color:var(--text-mute)">Rounds 9–23 unlock as picks happen</div></div>';
  tbl.innerHTML=h;
  let down=false,sx=0,sl=0;
  root.addEventListener('pointerdown',e=>{down=true;sx=e.clientX;sl=root.scrollLeft});
  root.addEventListener('pointermove',e=>{if(down)root.scrollLeft=sl-(e.clientX-sx)});
  addEventListener('pointerup',()=>down=false);
}

/* D — round runner */
const POSCOL={P:'var(--seam)',C:'var(--pos-c)','1B':'var(--pos-if)','2B':'var(--pos-if)','3B':'var(--pos-if)',SS:'var(--pos-if)',OF:'var(--pos-of)'};
function renderRound(r,root){
  const rd=ROUNDS.find(x=>x.r===r);
  if(!rd){root.innerHTML='<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">not started</span></div><div class="keys"><span>UNLOCKS WHEN ROUND '+(r-1)+' COMPLETES</span></div></div>';return}
  const made=rd.picks.filter(Boolean);
  const counts={};made.forEach(p=>counts[p.pos]=(counts[p.pos]||0)+1);
  const order=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const mix=order.map(p=>'<i style="flex:'+counts[p]+';background:'+(POSCOL[p]||'var(--text-mute)')+'"></i>').join('');
  const keys=order.map(p=>'<span style="color:'+(POSCOL[p]||'var(--text-mute)')+'"><b>'+counts[p]+'</b> '+p+'</span>').join('');
  const dir=overall(rd.nums[0])<overall(rd.nums[11])?'left to right':'right to left';
  let rows='';
  const seq=[...Array(12).keys()].sort((a,b)=>overall(rd.nums[a])-overall(rd.nums[b]));
  seq.forEach((i,k)=>{
    const pk=rd.picks[i],num=rd.nums[i],t=TEAMS[i];
    if(!pk){
      if(r===4&&i===5)rows+='<div class="sr now"><div class="rail"><span class="dot"></span></div><div class="tm">'+t[1]+'</div><div><div class="nm">On the clock — pick #42</div><div class="mt">Lou Gehrig queued first</div></div><div class="rt"><span class="chip flat">0:47</span></div></div>';
      else rows+='<div class="sr up"><div class="rail"><span class="dot"></span></div><div class="tm">'+t[1]+'</div><div><div class="nm">upcoming</div><div class="mt">'+t[0]+' · pick #'+overall(num)+'</div></div><div class="rt"></div></div>';
      return;
    }
    rows+='<div class="sr'+(t[2]?' me':'')+'" data-pos="'+pk.pos+'"><div class="rail"><span class="dot"></span></div><div class="tm">'+(t[2]?'★':'')+t[1]+'</div>'
      +'<div><div class="nm">'+pk.name+'</div><div class="mt"><span class="pos p-'+pk.pos+'">'+pk.pos+'</span> · '+pk.club+' · '+pk.yrs+'</div></div>'
      +'<div class="rt">'+chip(val(pk,num))+'<span class="stat">'+pk.sv+'<small>'+pk.sl+'</small></span></div></div>';
  });
  root.innerHTML='<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">'+made.length+' of 12 · picks #'+((r-1)*12+1)+'–'+(r*12)+'</span></div>'
    +'<div class="mix">'+mix+'</div><div class="keys">'+keys+'<span>SNAKE '+dir.toUpperCase()+'</span></div></div>'
    +'<div class="snake">'+rows+'<div class="turn">↩ SNAKE TURNS · ROUND '+(r+1)+' RUNS '+(dir==='left to right'?'RIGHT TO LEFT':'LEFT TO RIGHT')+'</div></div>';
}
function buildRTabs(){
  const bar=document.querySelector('[data-rtabs]'),pane=document.querySelector('[data-render="d"]');
  if(!bar||!pane)return;
  let h='';for(let r=1;r<=12;r++)h+='<button data-r="'+r+'" class="'+(r===4?'active':r<4?'done':'')+'">'+r+'</button>';
  bar.innerHTML=h;
  bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    renderRound(+b.dataset.r,pane);pane.scrollTop=0;
  }));
  renderRound(4,pane);
}
buildRTabs();

/* E — 3×4 team tiles for the round */
function roundHead(r,rd){
  if(!rd)return '<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">picks #'+((r-1)*12+1)+'–'+(r*12)+'</span></div><div class="keys"><span>UNLOCKS WHEN ROUND '+(r-1)+' COMPLETES</span></div></div>';
  const made=rd.picks.filter(Boolean),counts={};
  made.forEach(p=>counts[p.pos]=(counts[p.pos]||0)+1);
  const order=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const mix=order.map(p=>'<i style="flex:'+counts[p]+';background:'+(POSCOL[p]||'var(--text-mute)')+'"></i>').join('');
  const keys=order.map(p=>'<span style="color:'+(POSCOL[p]||'var(--text-mute)')+'"><b>'+counts[p]+'</b> '+p+'</span>').join('');
  const dir=overall(rd.nums[0])<overall(rd.nums[11])?'LEFT TO RIGHT':'RIGHT TO LEFT';
  return '<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">'+made.length+' of 12 · #'+((r-1)*12+1)+'–'+(r*12)+'</span></div>'
    +'<div class="mix">'+mix+'</div><div class="keys">'+keys+'<span>SNAKE '+dir+'</span></div></div>';
}
function renderTiles(r,root){
  const rd=ROUNDS.find(x=>x.r===r);
  if(!rd){
    const asc=r%2===1;let ph='';
    TEAMS.forEach((t,i)=>{const p=(r-1)*12+(asc?i+1:12-i);ph+='<div class="tile up"><div class="hd"><span>'+(t[2]?'★ ':'')+t[1]+'</span><span class="pk">'+r+'.'+String(p).padStart(2,'0')+'</span></div><div class="nm">upcoming</div></div>'});
    root.innerHTML=roundHead(r,null)+'<div class="tiles">'+ph+'</div>';return;
  }
  let tiles='';
  TEAMS.forEach((t,i)=>{
    const pk=rd.picks[i],num=rd.nums[i];
    if(!pk){
      if(r===4&&i===5)tiles+='<div class="tile now"><div class="hd"><span>★ '+t[1]+'</span><span class="pk">'+num+'</span></div><div class="nm">On the clock</div><div class="ft"><span>3 queued</span><span class="stat" style="color:var(--gold)">0:47</span></div></div>';
      else tiles+='<div class="tile up"><div class="hd"><span>'+t[1]+'</span><span class="pk">'+num+'</span></div><div class="nm">upcoming</div></div>';
      return;
    }
    tiles+='<div class="tile'+(t[2]?' me':'')+'" data-pos="'+pk.pos+'"><div class="hd"><span>'+(t[2]?'★ ':'')+t[1]+'</span><span class="pk">'+num+'</span></div>'
      +'<div class="nm">'+pk.name+'</div>'
      +'<div class="ft"><span class="pos p-'+pk.pos+'">'+pk.pos+' · '+pk.club+'</span><span class="stat">'+pk.sv+'</span></div></div>';
  });
  let best=null,worst=null;
  rd.picks.forEach((pk,i)=>{if(!pk)return;const v=val(pk,rd.nums[i]);if(!best||v>best.v)best={pk:pk,v:v,t:TEAMS[i]};if(!worst||v<worst.v)worst={pk:pk,v:v,t:TEAMS[i]}});
  const foot=best?'<div class="rfoot"><span class="h">Round '+r+' value</span>'
    +'<div class="l"><div><div class="nm">'+best.pk.name+'</div><div class="mt">best value · '+best.t[0]+'</div></div>'+chip(best.v)+'</div>'
    +'<div class="l"><div><div class="nm">'+worst.pk.name+'</div><div class="mt">earliest reach · '+worst.t[0]+'</div></div>'+chip(worst.v)+'</div></div>':'';
  root.innerHTML=roundHead(r,rd)+'<div class="tiles">'+tiles+'</div>'+foot;
}
(function(){
  const bar=document.querySelector('[data-rtabs-e]'),pane=document.querySelector('[data-render="e"]');
  if(!bar||!pane)return;
  let h='';for(let r=1;r<=12;r++)h+='<button data-r="'+r+'" class="'+(r===4?'active':r<4?'done':'')+'">'+r+'</button>';
  bar.innerHTML=h;
  bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    renderTiles(+b.dataset.r,pane);pane.scrollTop=0;
  }));
  renderTiles(4,pane);

  /* my-squad slider — same slot vocabulary as the live mock */
  const SQ=[['C','filled','YB'],['1B','open need','+'],['2B','open','–'],['3B','open','–'],['SS','open need','+'],['OF','filled','WM'],['OF','open','–'],['OF','open','–'],['UTIL','open','–'],['P','filled','PM'],['P','open','–'],['P','open','–'],['P','open','–'],['BN','open bench',''],['BN','open bench',''],['BN','open bench','']];
  const track=document.querySelector('[data-sqtrack]');
  if(!track)return;
  track.innerHTML=SQ.map(([p,cls,mk])=>'<div class="sb-slot '+cls+(cls.includes('bench')?' bench':'')+'" data-pos="'+p+'"><span class="sb-pos">'+p+'</span><span class="sb-mark">'+mk+'</span></div>').join('');
  let down=false,sx=0,sl=0;
  track.addEventListener('pointerdown',e=>{down=true;sx=e.clientX;sl=track.scrollLeft});
  track.addEventListener('pointermove',e=>{if(down)track.scrollLeft=sl-(e.clientX-sx)});
  addEventListener('pointerup',()=>down=false);

  /* slide-up player filter */
  const phone=document.querySelector('.phone.rel');
  if(!phone)return;
  phone.querySelectorAll('[data-open-sheet]').forEach(b=>b.addEventListener('click',()=>phone.dataset.sheet='open'));
  phone.querySelectorAll('[data-close-sheet]').forEach(b=>b.addEventListener('click',()=>phone.dataset.sheet='closed'));
  const AVAIL=[
    {name:'Lou Gehrig',pos:'1B',club:'NYY',yrs:'1923–39',sv:'.340',sl:'AVG',rank:25},
    {name:'Rogers Hornsby',pos:'2B',club:'STL',yrs:'1915–37',sv:'.358',sl:'AVG',rank:39},
    {name:'Greg Maddux',pos:'P',club:'ATL',yrs:'1986–08',sv:'355',sl:'W',rank:41},
    {name:'Jimmie Foxx',pos:'1B',club:'PHA',yrs:'1925–45',sv:'534',sl:'HR',rank:43},
    {name:'Ernie Banks',pos:'SS',club:'CHC',yrs:'1953–71',sv:'512',sl:'HR',rank:45},
    {name:'Mike Piazza',pos:'C',club:'NYM',yrs:'1992–07',sv:'427',sl:'HR',rank:47},
    {name:'Robin Yount',pos:'SS',club:'MIL',yrs:'1974–93',sv:'3,142',sl:'H',rank:49},
    {name:'Steve Carlton',pos:'P',club:'PHI',yrs:'1965–88',sv:'329',sl:'W',rank:50}
  ];
  const NEED={'1B':1,'SS':1};
  const chips=document.querySelector('[data-fchips]'),list=document.querySelector('[data-plist]');
  if(!chips||!list)return;
  const FILTERS=['MY NEEDS','ALL','C','1B','2B','3B','SS','OF','P'];
  let active='MY NEEDS';
  function paintList(){
    const rows=AVAIL.filter(p=>active==='ALL'||(active==='MY NEEDS'?NEED[p.pos]:p.pos===active));
    list.innerHTML=(rows.length?rows:AVAIL).map(p=>'<div class="prow'+(NEED[p.pos]?' fits':'')+'"><div class="rk">'+p.rank+'</div>'
      +'<div><div class="nm">'+p.name+'</div><div class="mt"><span class="pos p-'+p.pos+'">'+p.pos+'</span> · '+p.club+' · '+p.yrs+' · '+p.sv+' '+p.sl+'</div></div>'
      +'<button class="go">DRAFT</button></div>').join('');
  }
  chips.innerHTML=FILTERS.map(f=>'<button data-f="'+f+'" class="'+(f===active?'on ':'')+(f==='MY NEEDS'?'need':'')+'">'+f+'</button>').join('');
  chips.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    active=b.dataset.f;chips.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));paintList();
  }));
  paintList();
})();

/* Init — each option page has only its own node; every builder self-guards. */
const _a=document.querySelector('[data-render="a"]');if(_a)renderFeed(_a);
buildPager();
const _c=document.querySelector('[data-render="c"]');if(_c)renderMini(_c);
