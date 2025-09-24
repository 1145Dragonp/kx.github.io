// 全局变量
let config   = null;
let questions= [];
let audioPlayed = false;
let testHandle = null;        // 文件夹句柄
let fileMap  = {};            // 文件名→FileHandle

const params = new URLSearchParams(location.search);
const useLocal = params.has('local'); // 链接加 ?local 直接进本地模式

window.onload = () => {
  if (useLocal) document.getElementById('pickBtn').click();
};

// 1. 选择文件夹
document.getElementById('pickBtn').onclick = async () => {
  testHandle = await window.showDirectoryPicker();
  await buildFileMap(testHandle);
  await loadPaper();
};

// 2. 建立文件名映射
async function buildFileMap(dir, prefix = '') {
  for await const [name, handle] of dir.entries()) {
    const key = prefix + name;
    fileMap[key] = handle;
    if (handle.kind === 'directory') {
      await buildFileMap(handle, key + '/');
    }
  }
}

// 3. 加载试卷
async function loadPaper() {
  const content = document.getElementById('content');
  content.innerHTML = '加载中...';

  // 读取 config.json
  const cfgFile = fileMap['config.json'];
  if (!cfgFile) return alert('config.json 未找到！');
  config = JSON.parse(await readFile(cfgFile));

  document.getElementById('title').textContent = config.title;
  document.getElementById('importArea').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'inline-block';

  // 听力
  if (config.hasAudio && !audioPlayed) {
    const audioHandle = fileMap['audio/audio.mp3'];
    if (audioHandle) {
      const audioBlob = await audioHandle.getFile();
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.play();
      audioPlayed = true;
      audio.onended = () => content.innerHTML += '<p style="color:green;">听力播放完毕，请下滑继续答题。</p>';
    }
  }

  // 读取所有 q*.json
  questions = [];
  for (let i = 1; i <= config.questionCount; i++) {
    const qFile = fileMap[`q${i}.json`];
    if (!qFile) { console.warn(`q${i}.json 缺失`); continue; }
    questions.push(JSON.parse(await readFile(qFile)));
  }

  // 渲染
  content.innerHTML = '';
  questions.forEach(q => content.innerHTML += renderQuestion(q));

  // 倒计时
  startTimer(config.time * 60);
}

// 4. 渲染单题
function renderQuestion(q) {
  let html = `<div class="item"><p><strong>${q.question}</strong> （${q.score}分）</p>`;
  switch (q.gui) {
    case 'choice':
      html += q.options.map((opt, i) => `
        <label><input type="radio" name="${q.id}" value="${i}"> ${opt}</label><br>`).join('');
      break;
    case 'imageChoice':
      html += q.options.map((src, i) => `
        <label style="cursor:pointer;"><input type="radio" name="${q.id}" value="${i}">
        <img src="${URL.createObjectURL(fileMap[src].getFile())}" alt="选项${i}"></label>`).join('');
      break;
    case 'fill':
      html += `<input type="text" name="${q.id}" placeholder="请输入答案">`;
      break;
    case 'essay':
      html += `<textarea name="${q.id}" rows="6" style="width:100%;" placeholder="主观题，请作答"></textarea>`;
      break;
    default:
      html += '<p>未知题型</p>';
  }
  html += '</div>';
  return html;
}

// 5. 倒计时
function startTimer(seconds) {
  const timerEl = document.getElementById('timer');
  let left = seconds;
  const tid = setInterval(() => {
    if (left <= 0) { clearInterval(tid); submitPaper(); return; }
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    timerEl.textContent = `剩余时间：${m}:${s}`;
    left--;
  }, 1000);
}

// 6. 交卷
async function submitPaper() {
  let total = 0;
  questions.forEach(q => {
    const el = document.querySelector(`[name="${q.id}"]`);
    if (!el) return;
    if (q.gui === 'choice' || q.gui === 'imageChoice') {
      if (el.checked && parseInt(el.value) === q.answer) total += q.score;
    } else if (q.gui === 'fill') {
      if (el.value.trim().toLowerCase() === String(q.answer).toLowerCase()) total += q.score;
    }
    // essay 不计分
  });

  const result = document.getElementById('result');
  result.style.display = 'block';
  result.innerHTML = `<h3>考试结束</h3><p>总分：${total} / ${config.tps}</p>`;
  document.getElementById('submitBtn').style.display = 'none';
  document.getElementById('content').style.pointerEvents = 'none';
  document.getElementById('timer').textContent = '考试已结束';
}

// 7. 小工具：读取文件内容
async function readFile(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}
