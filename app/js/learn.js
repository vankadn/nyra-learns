import { getEmoji, DEFAULT_EMOJI } from './emoji.js';
import { speak } from './audio/tts.js';

function renderChip(wordObj, item, sec) {
  const emoji = getEmoji(wordObj, item, sec);
  const w = wordObj.word.replace(/"/g, '&quot;');
  const e = emoji.replace(/"/g, '&quot;');
  const level = wordObj.level || 'easy';
  return `<span class="chip" data-word="${w}" data-emoji="${e}" data-level="${level}">` +
    `<span class="chip-word">${wordObj.word}</span>` +
    `<span class="chip-emoji">${emoji}</span>` +
    `</span>`;
}

function setupChipListeners(container) {
  container.querySelectorAll('.word-chips').forEach(group => {
    let clickTimer = null;
    group.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (chip.classList.contains('flipped')) chip.classList.remove('flipped');
        speak(chip.dataset.word);
      }, 200);
    });
    group.addEventListener('dblclick', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      e.preventDefault();
      clearTimeout(clickTimer);
      chip.classList.add('flipped');
    });
  });
}

function setupShowMore(container) {
  container.querySelectorAll('.word-group, .team-group').forEach(group => {
    const medChips = group.querySelectorAll('.chip[data-level="medium"]');
    if (medChips.length === 0) return;
    const btn = document.createElement('button');
    btn.className = 'show-more-btn';
    btn.textContent = `+ ${medChips.length} more`;
    btn.addEventListener('click', () => {
      const showing = group.classList.toggle('show-medium');
      btn.textContent = showing ? '▲ show less' : `+ ${medChips.length} more`;
    });
    group.querySelector('.word-chips').after(btn);
  });
}

function renderTeacherNotesHTML(item) {
  const tn = item.teacherNotes;
  if (!tn) return { btn: '', panel: '' };
  const fields = [
    ['🗣️', 'How to say it', tn.howToSay],
    ['📏', 'Rule', tn.simpleRule],
    ['🇮🇳', 'Indian English tip', tn.indianDadTip],
    ['⚠️', 'Watch out', tn.commonMistake],
    ['💬', 'Example', tn.exampleSentence],
  ].filter(([,,v]) => v);
  if (!fields.length) return { btn: '', panel: '' };
  const panelId = `tn-${item.id}`;
  const btn = `<button class="tn-btn" data-panel="${panelId}">📋 Notes</button>`;
  const panel = `<div class="tn-panel" id="${panelId}" hidden>` +
    fields.map(([icon, label, val]) =>
      `<div class="tn-field"><span class="tn-label">${icon} ${label}:</span> ${val}</div>`
    ).join('') +
    `</div>`;
  return { btn, panel };
}

function setupTeacherNotes(container) {
  container.querySelectorAll('.tn-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      if (!panel) return;
      const isHidden = panel.hasAttribute('hidden');
      if (isHidden) {
        panel.removeAttribute('hidden');
        btn.classList.add('open');
        btn.textContent = '📋 ▲';
      } else {
        panel.setAttribute('hidden', '');
        btn.classList.remove('open');
        btn.textContent = '📋 Notes';
      }
    });
  });
}

export function renderVowelSection(sec, shortVowelColor) {
  const div = document.createElement('div');
  div.id = 'sec-' + sec.id;
  div.className = 'section';

  let html = `<div class="section-title">${sec.icon} ${sec.title}</div>`;

  if (sec.tip) html += `<div class="tip">📣 ${sec.tip}</div>`;

  if (sec.vowels) {
    html += `<div class="vowel-grid">`;
    for (const v of sec.vowels) {
      html += `<div class="vowel-card" onclick="(()=>{})()">
        <div class="letter" style="color:${sec.color}">${v.letter}</div>
        <div class="word">${v.example}</div>
      </div>`;
    }
    html += `</div>`;
  }

  if (sec.rule) html += `<div class="rule-box"><span>✨</span> ${sec.rule}</div>`;

  if (sec.transforms) {
    const beforeColor = shortVowelColor || '#5C6BC0';
    html += `<div class="magic-e-demo">`;
    for (const t of sec.transforms) {
      const base = t.after.slice(0, -1);
      html += `<div class="word-transform">
        <span style="color:${beforeColor}">${t.before}</span>
        <span class="arrow">→</span>
        <span style="color:${sec.color}">${base}<span class="magic-e" style="color:#F06292">e</span></span>
      </div>`;
    }
    html += `</div>`;
  }

  for (const item of sec.items) {
    const groupEmoji = item.defaultEmoji || sec.defaultEmoji || DEFAULT_EMOJI;
    const { btn: tnBtn, panel: tnPanel } = renderTeacherNotesHTML(item);
    html += `<div class="word-group" style="border-left-color:${sec.color}">
      <h3>${groupEmoji} ${item.label}${tnBtn}</h3>`;
    if (item.rule) html += `<div class="item-rule">📌 ${item.rule}</div>`;
    if (item.note) html += `<div class="item-note">💡 ${item.note}</div>`;
    html += `<div class="word-chips">`;
    for (const wordObj of item.words) {
      html += renderChip(wordObj, item, sec);
    }
    html += `</div>${tnPanel}</div>`;
  }

  div.innerHTML = html;

  // Wire vowel card clicks after setting innerHTML (onclick attr would lose scope)
  if (sec.vowels) {
    div.querySelectorAll('.vowel-card').forEach((card, i) => {
      card.addEventListener('click', () => speak(sec.vowels[i].speak));
    });
  }

  setupChipListeners(div);
  setupShowMore(div);
  setupTeacherNotes(div);
  return div;
}

export function renderTeamsSection(sec) {
  const div = document.createElement('div');
  div.id = 'sec-' + sec.id;
  div.className = 'section';

  let html = `<div class="section-title">${sec.icon} ${sec.title}</div>`;
  if (sec.tip) html += `<div class="tip">🤝 ${sec.tip}</div>`;

  for (const item of sec.items) {
    const { btn: tnBtn, panel: tnPanel } = renderTeacherNotesHTML(item);
    html += `<div class="team-group">
      <div class="team-group-head">
        <div class="team-label" style="background:${sec.color}">${item.label}</div>${tnBtn}
      </div>
      <div class="team-sound">👉 ${item.sound}</div>`;
    if (item.note) html += `<div class="item-note">💡 ${item.note}</div>`;
    html += `<div class="word-chips">`;
    for (const wordObj of item.words) {
      html += renderChip(wordObj, item, sec);
    }
    html += `</div>${tnPanel}</div>`;
  }

  div.innerHTML = html;
  setupChipListeners(div);
  setupShowMore(div);
  setupTeacherNotes(div);
  return div;
}
