/* Renderers for the desktop board options. Each page carries exactly one
   [data-render] node, so only that option renders. */
const TEAMS=[['Bronx Bombers',0],['Sandlot Swingers',0],['Chi-Town',0],['Dead Ball Legends',0],['Fenway Faithful',0],['Sandlot Dreamers',1],['Iron Horse Club',0],['Pinstripe Legacy',0],['Old Ball Game',0],['Splendid Swings',0],['Cooperstown FC',0],['Golden Era',0]];
// name, pos, club, career window, headline stat, stat label, pre-draft rank
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
const overall=n=>{const [r,p]=n.split('.');return parseInt(p,10)};
function valueOf(pk,num){return overall(num)-pk.rank}
function chip(v){const a=Math.abs(v);if(a<4)return '<span class="chip flat">EVEN</span>';const c=v>0?'steal':'reach';return '<span class="chip '+c+'">'+(v>0?'+':'−')+a+'</span>'}
function tint(v){if(v>=14)return 3;if(v>=6)return 2;if(v<=-14)return -3;if(v<=-6)return -2;return 0}

function cellClasses(i,isEmpty,isCurrent){let c='cell';if(TEAMS[i][1])c+=' me';if(isEmpty)c+=' empty';if(isCurrent)c+=' current';return c}

function render(kind,root){
  let h='<div></div>';
  TEAMS.forEach((t,i)=>{
    if(kind==='b'){
      const filled=[1,1,1,0,0,0].map((f,k)=>k<(i===5?3:4)?'f':(k===5?'p':''));
      h+='<div class="th-team'+(t[1]?' me':'')+'">'+(t[1]?'★ ':'')+t[0]+'<span class="dots">'+filled.map(f=>'<i class="'+f+'"></i>').join('')+'</span></div>';
    } else {
      h+='<div class="th-team'+(t[1]?' me':'')+'">'+(t[1]?'★ ':'')+t[0]+'</div>';
    }
  });
  ROUNDS.forEach(rd=>{
    h+='<div class="th-round">R'+rd.r+'</div>';
    rd.picks.forEach((pk,i)=>{
      const num=rd.nums[i];
      if(!pk){
        const isCur=(rd.r===4&&i===5);
        if(isCur){h+='<div class="'+cellClasses(i,false,true)+'"><div class="top"><div class="num">'+num+'</div><span class="chip flat">0:47</span></div><div class="pname">On the clock…</div><div class="meta">Your pick · 3 queued</div></div>';}
        else h+='<div class="'+cellClasses(i,true,false)+'"><div class="num">'+num+'</div></div>';
        return;
      }
      const v=valueOf(pk,num);
      if(kind==='a'){
        h+='<div class="'+cellClasses(i)+'" data-pos="'+pk.pos+'">'
         +'<div class="top"><div class="num">'+num+'</div>'+chip(v)+'</div>'
         +'<div class="pname">'+pk.name+'</div>'
         +'<div class="statline"><span class="meta"><b class="pos" style="font-family:var(--f-display)">'+pk.pos+'</b> · '+pk.club+' · '+pk.yrs+'</span></div>'
         +'<div class="statline"><span class="stat">'+pk.sv+'<span>'+pk.sl+'</span></span></div></div>';
      } else if(kind==='b'){
        h+='<div class="'+cellClasses(i)+'" data-pos="'+pk.pos+'">'
         +'<div class="rank"><span class="r">'+pk.rank+'</span><span class="l">RANK</span></div>'
         +'<div class="body"><div class="pname">'+pk.name+'</div>'
         +'<div class="meta"><b class="pos" style="font-family:var(--f-display)">'+pk.pos+'</b> · '+pk.club+' · '+pk.yrs+'</div>'
         +'<div class="statline"><span class="stat">'+pk.sv+'<span>'+pk.sl+'</span></span><span class="num">'+num+'</span></div>'
         +'</div></div>';
      } else {
        const t=tint(v);
        h+='<div class="'+cellClasses(i)+'" data-pos="'+pk.pos+'" data-v="'+t+'">'
         +'<div class="top statline"><span class="num">'+num+' · #'+pk.rank+'</span><span class="delta" style="color:'+(v>0?'var(--success)':v<0?'var(--seam-bright)':'var(--text-mute)')+'">'+(v>0?'+'+v:v===0?'—':v)+'</span></div>'
         +'<div class="pname">'+pk.name+'</div>'
         +'<div class="statline"><span class="meta"><b class="pos" style="font-family:var(--f-display)">'+pk.pos+'</b> · '+pk.club+'</span><span class="stat">'+pk.sv+'<span>'+pk.sl+'</span></span></div></div>';
      }
    });
  });
  if(kind==='c'){
    h+='<div class="footlbl">NET<br>VALUE</div>';
    TEAMS.forEach((t,i)=>{
      let sum=0;ROUNDS.forEach(rd=>{const pk=rd.picks[i];if(pk)sum+=valueOf(pk,rd.nums[i])});
      const col=sum>0?'var(--success)':sum<0?'var(--seam-bright)':'var(--text-mute)';
      h+='<div class="foot" style="color:'+col+(t[1]?';border-color:var(--gold-dim)':'')+'"><small>'+t[0].split(' ').map(w=>w[0]).join('')+'</small>'+(sum>0?'+':'')+sum+'</div>';
    });
  }
  root.innerHTML=h;
}
document.querySelectorAll('[data-render]').forEach(el=>render(el.dataset.render,el));
