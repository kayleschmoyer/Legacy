/* Minimal state machinery — no framework. The mockup IS a
   communication tool, not a runtime; this just toggles sections. */
(function(){
  const body = document.body;
  const stages = document.querySelectorAll('.stage');
  const stateBtns = document.querySelectorAll('#state-group button');
  const roleBtns  = document.querySelectorAll('#role-group button');
  const vpBtns    = document.querySelectorAll('#vp-group button');
  const sportBtns = document.querySelectorAll('#sport-group button');

  function setStage(s) {
    stages.forEach(el => el.classList.toggle('active', el.dataset.stage === s));
    stateBtns.forEach(b => b.classList.toggle('active', b.dataset.state === s));
  }
  function setRole(r) {
    body.dataset.role = r;
    roleBtns.forEach(b => b.classList.toggle('active', b.dataset.role === r));
    // Hide/show commissioner-only and member-only blocks
    document.querySelectorAll('[data-visible-to="commissioner"]').forEach(el => {
      el.style.display = (r === 'commissioner') ? '' : 'none';
    });
    document.querySelectorAll('[data-visible-to="member"]').forEach(el => {
      el.style.display = (r === 'member') ? '' : 'none';
    });
  }
  /* The draft room is split across two files: DraftRoom.html holds the
     .vp-desktop frame, DraftRoomMobile.html the .vp-mobile one. So a
     viewport the current page has no frame for is a NAVIGATION, not a
     class toggle — otherwise selecting 375 here just empties the stage. */
  const hasMobileFrame  = !!document.querySelector('.vp-mobile');
  const hasDesktopFrame = !!document.querySelector('.vp-desktop');
  function vpHref(v) {
    const base = document.querySelector('[data-vp-base]');
    const p = base ? base.dataset.vpBase : '';
    return (v === 'mobile' ? p + 'DraftRoomMobile.html' : p + 'DraftRoom.html') + '#vp=' + v;
  }
  function setVP(v) {
    const needsMobile = (v === 'mobile');
    if ((needsMobile && !hasMobileFrame) || (!needsMobile && !hasDesktopFrame)) {
      window.location.href = vpHref(v);
      return;
    }
    body.dataset.viewport = v;
    vpBtns.forEach(b => b.classList.toggle('active', b.dataset.vp === v));
  }
  function setSport(s) {
    body.dataset.sport = s;
    sportBtns.forEach(b => b.classList.toggle('active', b.dataset.sport === s));
  }

  stateBtns.forEach(b => b.addEventListener('click', () => setStage(b.dataset.state)));
  roleBtns .forEach(b => b.addEventListener('click', () => setRole(b.dataset.role)));
  vpBtns   .forEach(b => b.addEventListener('click', () => setVP(b.dataset.vp)));
  sportBtns.forEach(b => b.addEventListener('click', () => setSport(b.dataset.sport)));

  // ── View tabs (Cards / Data Table / Draft Board / Depth Chart) ──
  // Each `.view-tabs` + its sibling `.view-pane` set is independent,
  // so both the desktop and mobile viewport copies switch on their own.
  document.querySelectorAll('.view-tabs').forEach(tabBar => {
    const scope = tabBar.parentElement;            // the .main or equivalent
    const tabs  = tabBar.querySelectorAll('button[data-view]');
    const panes = scope.querySelectorAll(':scope > .view-pane[data-view]');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const v = tab.dataset.view;
      tabs .forEach(t => t.classList.toggle('active', t === tab));
      panes.forEach(p => p.classList.toggle('active', p.dataset.view === v));
    }));
  });

  // Init: member view (commissioner blocks hidden)
  /* Body attributes are authoritative per page — DraftRoomMobile.html
     ships only the .vp-mobile frame, so a hardcoded 'desktop' here
     would hide its only content. */
  setRole(body.dataset.role || 'member');
  /* A #vp= hash survives the cross-file hop, so landing on the other
     page keeps the size you picked (falling back to the page default). */
  const hashVP = (location.hash.match(/vp=([a-z]+)/) || [])[1];
  const wantVP = hashVP || body.dataset.viewport || 'desktop';
  setVP((wantVP === 'mobile') === hasMobileFrame ? wantVP : (body.dataset.viewport || 'desktop'));
  setSport(body.dataset.sport || 'baseball');
  /* Pages carry different stage sets now (DraftRoom.html has only
     populated; DraftRoom.states.html has the other three), so open
     whichever stage the page actually ships first. */
  const firstStage = document.querySelector('.stage');
  if (firstStage) setStage(firstStage.dataset.stage);
})();

  // ── Mobile: squad sheet + pick announcement ──────────────
  document.querySelectorAll('.mob').forEach(mob => {
    const open = () => mob.setAttribute('data-sheet', 'open');
    mob.querySelectorAll('[data-sheet-open]').forEach(el => el.addEventListener('click', open));
    mob.querySelectorAll('[data-sheet-close]').forEach(el =>
      el.addEventListener('click', () => mob.removeAttribute('data-sheet')));
    // Drafting a player fires the announcement; auto-dismiss at 5s per spec.
    let t;
    mob.querySelectorAll('.draft-sm').forEach(btn => btn.addEventListener('click', () => {
      mob.setAttribute('data-announce', 'on');
      clearTimeout(t);
      t = setTimeout(() => mob.removeAttribute('data-announce'), 5000);
    }));
    const ann = mob.querySelector('.mob-announce');
    if (ann) ann.addEventListener('click', () => { clearTimeout(t); mob.removeAttribute('data-announce'); });
  });

  // Mobile ADP / PTS sort toggle
  document.querySelectorAll('.mob-sort').forEach(g => g.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => {
      g.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    })));

  // ── Timeline rounds expand / collapse ────────────────────
  document.querySelectorAll('.tl-hd').forEach(hd => hd.addEventListener('click', () => {
    const r = hd.parentElement;
    const open = r.classList.toggle('open');
    const chev = hd.querySelector('.chev');
    if (chev) chev.textContent = open ? '▾' : '▸';
  }));

  // ── Pick inspector ───────────────────────────────────────
  // One modal per viewport frame. Cells carry only a position;
  // the rest of the pick is derived from grid coordinates so the
  // mock stays internally consistent (snake order, team column).
  (function () {
    const POOL = {
      baseball: {
        P:['Bob Gibson','Sandy Koufax','Pedro Martinez','Walter Johnson'],
        SP:['Tom Seaver','Randy Johnson','Steve Carlton','Bob Feller'],
        RP:['Mariano Rivera','Dennis Eckersley','Trevor Hoffman','Goose Gossage'],
        C:['Yogi Berra','Josh Gibson','Ivan Rodriguez','Roy Campanella'],
        '1B':['Jimmie Foxx','Willie McCovey','Eddie Murray','Harmon Killebrew'],
        '2B':['Joe Morgan','Jackie Robinson','Nap Lajoie','Charlie Gehringer'],
        '3B':['Mike Schmidt','Brooks Robinson','George Brett','Eddie Mathews'],
        SS:['Ernie Banks','Cal Ripken Jr.','Ozzie Smith','Arky Vaughan'],
        OF:['Ty Cobb','Mel Ott','Roberto Clemente','Tris Speaker'],
        DH:['Frank Thomas','Edgar Martinez','David Ortiz','Paul Molitor']
      },
      football: {
        QB:['Steve Young','Joe Montana','Brett Favre','Fran Tarkenton'],
        RB:['Barry Sanders','Walter Payton','Jim Brown','LaDainian Tomlinson'],
        WR:['Jerry Rice','Terrell Owens','Marvin Harrison','Cris Carter'],
        TE:['Rob Gronkowski','Shannon Sharpe','Antonio Gates','Mike Ditka'],
        K:['Adam Vinatieri','Morten Andersen','Justin Tucker','Jan Stenerud'],
        DEF:['Lawrence Taylor','Reggie White','Deion Sanders','Ronnie Lott']
      }
    };
    const TEAMNAME = {
      BB:'Bronx Bombers', SW:'Sandlot Swingers', CT:'Chi-Town', DL:'Dead Ball Legends', FF:'Fenway Faithful', SD:'Sandlot Dreamers', IH:'Iron Horse Club', PL:'Pinstripe Legacy', OB:'Old Ball Game', SPS:'Splendid Swings', CF:'Cooperstown FC', GE:'Golden Era',
      SCC:'Steel Curtain Crew', FT:'Frozen Tundra', MOM:'Monsters of Midway', GG:'Greatest Generation', TMD:'Two-Minute Drill', SUN:'Sunday Captains', IRH:'Iron Helmets', CM:'Cleat Marks', GLS:'Goal Line Stand', HMH:'Hash Mark Heroes', CAN:'Canton Calling', LOM:'Lombardi Trophy'
    };
    function sport() { return document.body.dataset.sport || 'baseball'; }
    function nameFor(pos, seed) {
      const pool = POOL[sport()][pos];
      if (!pool) return 'Unnamed pick';
      return pool[seed % pool.length];
    }
    function modalFor(frame) {
      let m = frame.querySelector('.pick-modal');
      if (m) return m;
      m = document.createElement('div');
      m.className = 'pick-modal';
      m.innerHTML = '<div class="pm-card"><button class="pm-x" aria-label="Close">×</button>' +
        '<div class="pm-eyebrow"></div><h3></h3><div class="pm-meta"></div>' +
        '<dl class="pm-rows"></dl><p class="pm-empty"></p></div>';
      m.addEventListener('click', e => { if (e.target === m || e.target.classList.contains('pm-x')) close(m); });
      frame.appendChild(m);
      return m;
    }
    function close(m) { m.classList.remove('open'); }
    window.__pickModal = (frame, data) => show(frame, data);
    function show(frame, data) {
      const m = modalFor(frame);
      m.querySelector('.pm-eyebrow').textContent = data.eyebrow;
      m.querySelector('h3').textContent = data.title;
      m.querySelector('.pm-meta').textContent = data.meta || '';
      const dl = m.querySelector('.pm-rows');
      dl.innerHTML = data.rows.map(r => '<div class="pm-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
      dl.style.display = data.rows.length ? '' : 'none';
      const em = m.querySelector('.pm-empty');
      em.textContent = data.empty || '';
      em.style.display = data.empty ? '' : 'none';
      m.classList.add('open');
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.querySelectorAll('.pick-modal.open').forEach(close);
    });

    // Mobile mini-board cells — every cell carries its own pick
    // data, sourced from the same 12-team snake as .board-grid.
    document.querySelectorAll('.mob-board .mc').forEach(cell => {
      cell.addEventListener('click', () => {
        const frame = cell.closest('.viewport');
        const num = cell.dataset.num || '';
        const team = cell.dataset.team || '';
        const round = num.split('.')[0];
        const eyebrow = 'Pick ' + num + ' · Round ' + round;
        if (cell.dataset.state === 'now') {
          show(frame, { eyebrow: eyebrow, title: 'On the clock', meta: team + ' · 0:47 remaining',
            rows: [['Team', team], ['Pick', num], ['Status', 'Choosing now — your pick']] });
        } else if (cell.dataset.state === 'upcoming') {
          show(frame, { eyebrow: eyebrow, title: 'Not yet made', meta: team,
            rows: [], empty: team + ' is on the board at ' + num + '.' });
        } else {
          show(frame, { eyebrow: eyebrow, title: cell.dataset.player || '',
            meta: cell.dataset.pos + ' · drafted by ' + team,
            rows: [['Team', team], ['Position', cell.dataset.pos], ['Pick', num], ['Status', 'Rostered']] });
        }
      });
    });

    // Desktop board grid — the cell already carries its own copy
    document.querySelectorAll('.board-grid .cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const frame = cell.closest('.viewport');
        const num = (cell.querySelector('.num') || {}).textContent || '';
        const nm  = (cell.querySelector('.pname') || {}).textContent || '';
        const pos = cell.dataset.pos || '';
        if (cell.classList.contains('current')) {
          show(frame, { eyebrow: num + ' · on the clock', title: 'On the clock', meta: '0:47 remaining',
            rows: [['Pick', num], ['Status', 'Choosing now']] });
        } else if (cell.classList.contains('empty') || !nm) {
          show(frame, { eyebrow: num || 'Upcoming pick', title: 'Not yet made', meta: '',
            rows: [], empty: 'This slot fills when the draft reaches it.' });
        } else {
          show(frame, { eyebrow: num, title: nm.trim(), meta: pos ? pos + ' · rostered' : 'Rostered',
            rows: [['Pick', num], ['Position', pos || '—'], ['Status', cell.classList.contains('me') ? 'On your roster' : 'Rostered']] });
        }
      });
    });

    // Timeline rows
    document.querySelectorAll('.tl-pick').forEach(row => {
      row.addEventListener('click', () => {
        const frame = row.closest('.viewport');
        const num = (row.querySelector('.n') || {}).textContent || '';
        const abbr = (row.querySelector('.tm') || {}).textContent || '';
        const nm = (row.querySelector('.nm') || {}).textContent || '';
        const mt = (row.querySelector('.mt') || {}).textContent || '';
        const team = TEAMNAME[abbr] || abbr;
        if (row.classList.contains('now')) {
          show(frame, { eyebrow: num + ' · Round 4', title: 'On the clock', meta: team + ' · 0:47 remaining',
            rows: [['Team', team], ['Pick', num], ['Status', 'Choosing now — your pick']] });
        } else if (row.classList.contains('up')) {
          show(frame, { eyebrow: num + ' · Round 4', title: 'Not yet made', meta: team,
            rows: [], empty: team + ' picks at ' + num + '.' });
        } else {
          const pos = row.dataset.pos || '';
          show(frame, { eyebrow: num + ' · Round 4', title: nm, meta: pos + ' · drafted by ' + team,
            rows: [['Team', team], ['Position', pos || '—'], ['Pick', num], ['Status', row.classList.contains('me') ? 'On your roster' : 'Rostered']] });
        }
      });
    });
  })();

  // Squad sheet team selector — swaps the sheet heading context.
  document.querySelectorAll('.team-select').forEach(sel => sel.addEventListener('change', () => {
    const sheet = sel.closest('.mob-sheet');
    const p = sel.parentElement.querySelector('p');
    const mine = sel.selectedIndex === 0;
    if (p) p.style.opacity = mine ? '1' : '0.6';
    if (sheet) sheet.dataset.viewing = mine ? 'me' : 'other';
  }));

  /* Positions strip: click-and-drag to scroll horizontally. */
  document.querySelectorAll('.sb-track').forEach(track => {
    let down = false, startX = 0, startLeft = 0, moved = 0;
    track.addEventListener('pointerdown', e => {
      down = true; moved = 0; startX = e.clientX; startLeft = track.scrollLeft;
      track.classList.add('dragging');
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      track.scrollLeft = startLeft - dx;
    });
    const end = e => {
      if (!down) return;
      down = false; track.classList.remove('dragging');
      if (track.hasPointerCapture && e.pointerId != null && track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('click', e => { if (moved > 4) { e.preventDefault(); e.stopPropagation(); } }, true);
    track.addEventListener('dragstart', e => e.preventDefault());
  });
  /* ── Mobile round view + pick sheet (exploration E) ───────
     One data table per sport drives the round tabs, the tiles,
     the round-value footer and the available-player sheet, so
     baseball and football stay in step with the desktop board. */
  (function(){
    const P=(name,pos,club,yrs,sv,sl,rank)=>({name,pos,club,yrs,sv,sl,rank});
    const DATA={
      baseball:{
        teams:[['Bronx Bombers','BB'],['Sandlot Swingers','SW'],['Chi-Town','CT'],['Dead Ball Legends','DL'],['Fenway Faithful','FF'],['Sandlot Dreamers','SD',1],['Iron Horse Club','IH'],['Pinstripe Legacy','PL'],['Old Ball Game','OB'],['Splendid Swings','SPS'],['Cooperstown FC','CF'],['Golden Era','GE']],
        rounds:[
          {r:1,nums:['1.01','1.02','1.03','1.04','1.05','1.06','1.07','1.08','1.09','1.10','1.11','1.12'],picks:[
            P('Babe Ruth','OF','NYY','1914–35','714','HR',1),P('Barry Bonds','OF','SFG','1986–07','762','HR',2),
            P('Willie Mays','OF','SFG','1951–73','660','HR',3),P('Ted Williams','OF','BOS','1939–60','.344','AVG',5),
            P('Cy Young','P','CLE','1890–11','511','W',8),P('Yogi Berra','C','NYY','1946–65','358','HR',14),
            P('Roger Clemens','P','BOS','1984–07','354','W',9),P('Alex Rodriguez','3B','NYY','1994–16','696','HR',7),
            P('Mickey Mantle','OF','NYY','1951–68','536','HR',6),P('Randy Johnson','P','ARI','1988–09','4,875','K',12),
            P('Cal Ripken Jr.','SS','BAL','1981–01','3,184','H',15),P('Joe DiMaggio','OF','NYY','1936–51','.325','AVG',11)]},
          {r:2,nums:['2.24','2.23','2.22','2.21','2.20','2.19','2.18','2.17','2.16','2.15','2.14','2.13'],picks:[
            P('Frank Robinson','OF','BAL','1956–76','586','HR',13),P('Tom Seaver','P','NYM','1967–86','311','W',18),
            P('Nolan Ryan','P','HOU','1966–93','5,714','K',10),P('R. Henderson','OF','OAK','1979–03','1,406','SB',16),
            P('Mike Trout','OF','LAA','2011–','.301','AVG',20),P('Pedro Martínez','P','BOS','1992–09','2.93','ERA',17),
            P('Sandy Koufax','P','LAD','1955–66','2.76','ERA',22),P('Ken Griffey Jr.','OF','SEA','1989–10','630','HR',19),
            P('Warren Spahn','P','MIL','1942–65','363','W',26),P('Tris Speaker','OF','CLE','1907–28','.345','AVG',30),
            P('Eddie Mathews','3B','MIL','1952–68','512','HR',28),P('Derek Jeter','SS','NYY','1995–14','3,465','H',21)]},
          {r:3,nums:['3.25','3.26','3.27','3.28','3.29','3.30','3.31','3.32','3.33','3.34','3.35','3.36'],picks:[
            P('Walter Johnson','P','WSH','1907–27','417','W',4),P('C. Mathewson','P','NYG','1900–16','373','W',33),
            P('Mel Ott','OF','NYG','1926–47','511','HR',29),P('J. Robinson','2B','BRO','1947–56','.311','AVG',31),
            P('Stan Musial','OF','STL','1941–63','475','HR',23),P('Honus Wagner','SS','PIT','1897–17','.328','AVG',24),
            P('Ozzie Smith','SS','STL','1978–96','580','SB',44),P('Albert Pujols','1B','STL','2001–22','703','HR',27),
            P('Bob Gibson','P','STL','1959–75','2.91','ERA',35),P('R. Clemente','OF','PIT','1955–72','3,000','H',32),
            P('C. Yastrzemski','OF','BOS','1961–83','452','HR',40),P('Johnny Bench','C','CIN','1967–83','389','HR',34)]},
          {r:4,nums:['4.37','4.38','4.39','4.40','4.41','4.42','4.43','4.44','4.45','4.46','4.47','4.48'],picks:[
            P('Rod Carew','2B','MIN','1967–85','.328','AVG',36),P('Tony Gwynn','OF','SDP','1982–01','.338','AVG',38),
            P('George Brett','3B','KCR','1973–93','3,154','H',37),P('Wade Boggs','3B','BOS','1982–99','.328','AVG',42),
            P('Tony Pérez','1B','CIN','1964–86','379','HR',52),null,null,null,null,null,null,null]}
        ],
        needs:{'1B':1,'SS':1},
        filters:['MY NEEDS','ALL','C','1B','2B','3B','SS','OF','P'],
        avail:[
          P('Lou Gehrig','1B','NYY','1923–39','.340','AVG',14),P('Rogers Hornsby','2B','STL','1915–37','.358','AVG',15),
          P('Greg Maddux','P','ATL','1986–08','355','W',41),P('Jimmie Foxx','1B','PHA','1925–45','534','HR',43),
          P('Ernie Banks','SS','CHC','1953–71','512','HR',45),P('Mike Piazza','C','NYM','1992–07','427','HR',47),
          P('Robin Yount','SS','MIL','1974–93','3,142','H',49),P('Steve Carlton','P','PHI','1965–88','329','W',50)]
      },
      football:{
        teams:[['Steel Curtain Crew','SCC'],['Frozen Tundra','FT'],['Monsters of Midway','MOM'],['Greatest Generation','GG'],['Two-Minute Drill','TMD'],['Sunday Captains','SUN',1],['Iron Helmets','IRH'],['Cleat Marks','CM'],['Goal Line Stand','GLS'],['Hash Mark Heroes','HMH'],['Canton Calling','CAN'],['Lombardi Trophy','LOM']],
        rounds:[
          {r:1,nums:['1.01','1.02','1.03','1.04','1.05','1.06','1.07','1.08','1.09','1.10','1.11','1.12'],picks:[
            P('Tom Brady','QB','NEP','2000–22','649','TD',1),P('Jerry Rice','WR','SFO','1985–04','197','TD',2),
            P('Jim Brown','RB','CLE','1957–65','12,312','YDS',4),P('P. Mahomes','QB','KAN','2017–','5.0','TD/G',3),
            P('P. Manning','QB','IND','1998–15','539','TD',6),P('Joe Montana','QB','SFO','1979–94','273','TD',13),
            P('Walter Payton','RB','CHI','1975–87','16,726','YDS',5),P('L. Taylor','DEF','NYG','1981–93','132.5','SACK',8),
            P('Aaron Donald','DEF','LAR','2014–23','111','SACK',10),P('Barry Sanders','RB','DET','1989–98','15,269','YDS',7),
            P('Calvin Johnson','WR','DET','2007–15','11,619','YDS',16),P('R. Gronkowski','TE','NEP','2010–21','92','TD',18)]},
          {r:2,nums:['2.24','2.23','2.22','2.21','2.20','2.19','2.18','2.17','2.16','2.15','2.14','2.13'],picks:[
            P('Aaron Rodgers','QB','GNB','2005–24','503','TD',11),P('Drew Brees','QB','NOR','2001–20','571','TD',12),
            P('Reggie White','DEF','PHI','1985–00','198','SACK',9),P('Brett Favre','QB','GNB','1991–10','508','TD',20),
            P('L. Tomlinson','RB','SDG','2001–11','13,684','YDS',17),P('Bruce Smith','DEF','BUF','1985–03','200','SACK',15),
            P('Cris Carter','WR','MIN','1987–02','130','TD',26),P('Steve Young','QB','SFO','1985–99','232','TD',24),
            P('Anthony Muñoz','TE','CIN','1980–92','4','TD',30),P('Joe Greene','DEF','PIT','1969–81','78.5','SACK',28),
            P('Ronnie Lott','DEF','SFO','1981–94','63','INT',31),P('Earl Campbell','RB','HOU','1978–85','9,407','YDS',22)]},
          {r:3,nums:['3.25','3.26','3.27','3.28','3.29','3.30','3.31','3.32','3.33','3.34','3.35','3.36'],picks:[
            P('Eric Dickerson','RB','LAR','1983–93','13,259','YDS',19),P('T. Bradshaw','QB','PIT','1970–83','4','RINGS',34),
            P('Ray Lewis','DEF','BAL','1996–12','41.5','SACK',21),P('Curtis Martin','RB','NYJ','1995–05','14,101','YDS',36),
            P('Antonio Gates','TE','SDG','2003–18','116','TD',29),P('M. Harrison','WR','IND','1996–08','128','TD',27),
            P('L. Fitzgerald','WR','ARI','2004–20','17,492','YDS',33),P('Champ Bailey','DEF','DEN','1999–13','52','INT',44),
            P('Steve Largent','WR','SEA','1976–89','100','TD',40),P('Tony Dorsett','RB','DAL','1977–88','12,739','YDS',38),
            P('Joe Thomas','TE','CLE','2007–17','','',48),P('R. Staubach','QB','DAL','1969–79','153','TD',42)]},
          {r:4,nums:['4.37','4.38','4.39','4.40','4.41','4.42','4.43','4.44','4.45','4.46','4.47','4.48'],picks:[
            P('Mel Blount','DEF','PIT','1970–83','57','INT',39),P('Marcus Allen','RB','LAR','1982–97','12,243','YDS',37),
            P('Lamar Jackson','QB','BAL','2018–','6,173','RUSH',35),P('Russell Wilson','QB','SEA','2012–','350','TD',46),
            P('Don Hutson','WR','GNB','1935–45','99','TD',41),null,null,null,null,null,null,null]}
        ],
        needs:{'RB':1,'WR':1},
        filters:['MY NEEDS','ALL','QB','RB','WR','TE','K','DEF'],
        avail:[
          P('Emmitt Smith','RB','DAL','1990–04','18,355','YDS',14),P('A. Peterson','RB','MIN','2007–21','14,918','YDS',23),
          P('Randy Moss','WR','MIN','1998–12','156','TD',25),P('Terrell Owens','WR','SFO','1996–10','153','TD',32),
          P('Deion Sanders','DEF','DAL','1989–05','53','INT',43),P('Travis Kelce','TE','KAN','2013–','12,151','YDS',45),
          P('John Elway','QB','DEN','1983–98','300','TD',47),P('Justin Tucker','K','BAL','2012–','90.2','FG%',60)]
      }
    };
    const POSCOL={P:'var(--seam)',QB:'var(--seam)',C:'var(--pos-c)',TE:'var(--pos-c)','1B':'var(--pos-if)','2B':'var(--pos-if)','3B':'var(--pos-if)',SS:'var(--pos-if)',RB:'var(--pos-if)',OF:'var(--pos-of)',WR:'var(--pos-of)',DEF:'var(--pos-def)',K:'var(--gold)'};
    const overall = n => parseInt(n.split('.')[1], 10);
    const val = (pk, num) => overall(num) - pk.rank;
    function vchip(v){ const a=Math.abs(v); if(a<4) return ''; return '<span class="vchip '+(v>0?'steal':'reach')+'">'+(v>0?'+':'−')+a+'</span>'; }

    function head(sp, r, rd){
      const range = '#'+((r-1)*12+1)+'–'+(r*12);
      if(!rd) return '<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">picks '+range+'</span></div><div class="keys"><span>UNLOCKS WHEN ROUND '+(r-1)+' COMPLETES</span></div></div>';
      const made = rd.picks.filter(Boolean), counts = {};
      made.forEach(p => counts[p.pos] = (counts[p.pos]||0)+1);
      const order = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
      const mix  = order.map(p => '<i style="flex:'+counts[p]+';background:'+(POSCOL[p]||'var(--text-mute)')+'"></i>').join('');
      const keys = order.map(p => '<span style="color:'+(POSCOL[p]||'var(--text-mute)')+'"><b>'+counts[p]+'</b> '+p+'</span>').join('');
      const dir  = overall(rd.nums[0]) < overall(rd.nums[11]) ? 'LEFT TO RIGHT' : 'RIGHT TO LEFT';
      return '<div class="rsum"><div class="top"><span class="h">Round '+r+'</span><span class="s">'+made.length+' of 12 · '+range+'</span></div>'
        + '<div class="mix">'+mix+'</div><div class="keys">'+keys+'<span>SNAKE '+dir+'</span></div></div>';
    }
    function renderRound(sp, r, root){
      const d = DATA[sp], rd = d.rounds.find(x => x.r === r);
      let tiles = '';
      if(!rd){
        const asc = r % 2 === 1;
        d.teams.forEach((t,i) => {
          const p = (r-1)*12 + (asc ? i+1 : 12-i);
          tiles += '<div class="tile up"><div class="hd"><span>'+(t[2]?'★ ':'')+t[1]+'</span><span class="pk">'+r+'.'+String(p).padStart(2,'0')+'</span></div><div class="nm">upcoming</div></div>';
        });
        root.innerHTML = '<div class="rtabs"></div><div class="body">'+head(sp,r,null)+'<div class="tiles">'+tiles+'</div></div>';
        return;
      }
      let best = null, worst = null;
      d.teams.forEach((t,i) => {
        const pk = rd.picks[i], num = rd.nums[i];
        if(!pk){
          if(t[2]) tiles += '<div class="tile now" data-num="'+num+'" data-team="'+t[0]+'" data-state="now"><div class="hd"><span>★ '+t[1]+'</span><span class="pk">'+num+'</span></div><div class="nm">On the clock</div><div class="ft"><span>3 queued</span><span class="stat" style="color:var(--gold)">0:47</span></div></div>';
          else tiles += '<div class="tile up" data-num="'+num+'" data-team="'+t[0]+'"><div class="hd"><span>'+t[1]+'</span><span class="pk">'+num+'</span></div><div class="nm">upcoming</div></div>';
          return;
        }
        const v = val(pk, num);
        if(!best || v > best.v) best = {pk:pk, v:v, t:t};
        if(!worst || v < worst.v) worst = {pk:pk, v:v, t:t};
        tiles += '<div class="tile'+(t[2]?' me':'')+'" data-pos="'+pk.pos+'" data-num="'+num+'" data-team="'+t[0]+'" data-player="'+pk.name+'">'
          + '<div class="hd"><span>'+(t[2]?'★ ':'')+t[1]+'</span><span class="pk">'+num+'</span></div>'
          + '<div class="nm">'+pk.name+'</div>'
          + '<div class="ft"><span class="ps" data-p="'+pk.pos+'">'+pk.pos+' · '+pk.club+'</span><span class="stat">'+pk.sv+'</span></div></div>';
      });
      const foot = best ? '<div class="rfoot"><span class="h">Round '+r+' value</span>'
        + '<div class="l"><div><div class="nm">'+best.pk.name+'</div><div class="mt">best value · '+best.t[0]+'</div></div>'+(vchip(best.v)||'<span class="vchip flat">EVEN</span>')+'</div>'
        + '<div class="l"><div><div class="nm">'+worst.pk.name+'</div><div class="mt">earliest reach · '+worst.t[0]+'</div></div>'+(vchip(worst.v)||'<span class="vchip flat">EVEN</span>')+'</div></div>' : '';
      root.innerHTML = '<div class="rtabs"></div><div class="body">'+head(sp,r,rd)+'<div class="tiles">'+tiles+'</div>'+foot+'</div>';
    }
    function paintTabs(sp, root, cur){
      const bar = root.querySelector('.rtabs');
      let h = '';
      for(let r=1; r<=12; r++) h += '<button data-r="'+r+'" class="'+(r===cur?'active':(r<4?'done':''))+'">'+r+'</button>';
      bar.innerHTML = h;
      bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const r = +b.dataset.r;
        renderRound(sp, r, root); paintTabs(sp, root, r); wireTiles(root);
      }));
    }
    /* Tiles reuse the existing pick-inspect modal. */
    function wireTiles(root){
      root.querySelectorAll('.tile').forEach(tile => tile.addEventListener('click', () => {
        const frame = tile.closest('.viewport');
        const num = tile.dataset.num || '', team = tile.dataset.team || '', nm = tile.dataset.player || '';
        const round = num.split('.')[0], eyebrow = 'Pick ' + num + ' · Round ' + round;
        if(!frame || typeof window.__pickModal !== 'function') return;
        if(tile.dataset.state === 'now') window.__pickModal(frame, { eyebrow: eyebrow, title: 'On the clock', meta: team + ' · 0:47 remaining', rows: [], empty: 'Your pick — 3 players queued.' });
        else if(!nm) window.__pickModal(frame, { eyebrow: eyebrow, title: 'Not yet picked', meta: team, rows: [], empty: team + ' picks at ' + num + '.' });
        else window.__pickModal(frame, { eyebrow: eyebrow, title: nm, meta: (tile.dataset.pos||'') + ' · drafted by ' + team,
          rows: [['Team', team], ['Position', tile.dataset.pos || '—'], ['Pick', num], ['Status', tile.classList.contains('me') ? 'On your roster' : 'Rostered']] });
      }));
    }
    document.querySelectorAll('.mob-round').forEach(root => {
      const sp = root.dataset.sport;
      renderRound(sp, 4, root); paintTabs(sp, root, 4); wireTiles(root);
    });

    /* Slide-up available-player list — the board is the main mobile
       view; the player browser rides in a sheet raised from the CTA or
       the squad strip, so picking never leaves the round grid. */
    document.querySelectorAll('.mob-picksheet').forEach(sheet => {
      const mob = sheet.closest('.mob');
      if(!mob) return;
      mob.querySelectorAll('[data-picksheet-open]').forEach(b => b.addEventListener('click', () => mob.dataset.picksheet = 'open'));
      mob.querySelectorAll('[data-picksheet-close]').forEach(b => b.addEventListener('click', () => mob.dataset.picksheet = 'closed'));
      /* Drafting from the sheet closes it so the announcement lands on the board. */
      sheet.querySelectorAll('.draft-sm').forEach(b => b.addEventListener('click', () => mob.dataset.picksheet = 'closed'));

      /* Players / Queue / History — the draft room's in-page nav (LS-10165).
         The heading follows the tab; a pick action always lands on Players. */
      const tabs = sheet.querySelectorAll('.mob-tabs [data-pstab]');
      const heading = sheet.querySelector('.sh-hd h3');
      const selectTab = tab => {
        sheet.dataset.tab = tab.dataset.pstab;
        tabs.forEach(x => x.classList.toggle('active', x === tab));
        if (heading) heading.textContent = tab.dataset.title;
      };
      tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)));
      mob.querySelectorAll('[data-picksheet-open]').forEach(b => b.addEventListener('click', () => {
        const players = sheet.querySelector('[data-pstab="players"]');
        if (players) selectTab(players);
      }));
    });

    /* Chat panel, raised from the clock bar's chat control; opening it
       clears the unread dot. */
    document.querySelectorAll('.mob-chat').forEach(panel => {
      const mob = panel.closest('.mob');
      if(!mob) return;
      mob.querySelectorAll('[data-chat-open]').forEach(b => b.addEventListener('click', () => {
        mob.dataset.chat = 'open';
        const dot = b.querySelector('.dot');
        if (dot) dot.remove();
        b.setAttribute('aria-label', 'Open chat');
      }));
      panel.querySelectorAll('[data-chat-close]').forEach(b => b.addEventListener('click', () => { mob.dataset.chat = 'closed'; }));
    });
  })();

  /* Board-view player dock: collapsed bar → slide-up list. */
  document.querySelectorAll('.bd-dock').forEach(dock => {
    dock.querySelectorAll('[data-dock-toggle]').forEach(b => b.addEventListener('click', () => {
      dock.dataset.open = dock.dataset.open === 'true' ? 'false' : 'true';
    }));
    dock.querySelectorAll('.tools .chip').forEach(c => c.addEventListener('click', () => {
      dock.querySelectorAll('.tools .chip').forEach(x => x.classList.toggle('on', x === c));
    }));
  });

