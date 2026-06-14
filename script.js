// =====================
//  STATE
// =====================
let questions = [];
let currentQ = 0;
let score = 0;
let timer = null;
let timeLeft = 30;
let answered = false;
let userAnswers = [];

// =====================
//  THEME TOGGLE
// =====================
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
});

// =====================
//  DRAG & DROP
// =====================
const uploadArea = document.getElementById('uploadArea');
const fileInput  = document.getElementById('fileInput');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
  if (file && allowed.includes(file.type)) {
    handleFile(file);
  } else {
    alert('This file type is not supported. Please upload a PDF, Image, or Text file!');
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// =====================
//  FILE HANDLER
// =====================
function handleFile(file) {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
  if (!allowed.includes(file.type)) {
    alert('This file type is not supported. Please upload a PDF, Image, or Text file!');
    fileInput.value = '';
    return;
  }
  const icon  = uploadArea.querySelector('.upload-icon');
  const title = uploadArea.querySelector('.upload-title');
  const sub   = uploadArea.querySelector('.upload-sub');
  icon.textContent  = '✅';
  title.textContent = file.name;
  sub.textContent   = `${(file.size / 1024).toFixed(1)} KB — ready to generate`;
}
// =====================
//  GENERATE QUIZ
// =====================
document.getElementById('generateBtn').addEventListener('click', async () => {
  const pasteText = document.getElementById('pasteText').value.trim();
  const file = fileInput.files[0];

  if (!pasteText && !file) {
    alert('Please upload a file or paste your notes first!');
    return;
  }

  let contentText = pasteText;

  if (file && !pasteText) {
    if (file.type === 'text/plain') {
      contentText = await file.text();
    } else if (file.type.startsWith('image/')) {
      contentText = await readFileAsBase64(file);
      await generateQuizFromImage(contentText, file.type);
      return;
    }  else if (file.type === 'application/pdf') {
      contentText = await extractTextFromPDF(file);
    } else {
      alert('For PDF support, paste your notes as text for now. Image and text files work directly!');
      return;
    }
  }

  await generateQuizFromText(contentText);
});

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// =====================
//  AI CALL — TEXT
// =====================
async function generateQuizFromText(text) {
  showScreen('loadingScreen');
  animateLoadingSteps();

  const API_KEY = document.getElementById('apiKeyInput').value.trim();

  const prompt = `You are a quiz generator. Based on the following study material, generate exactly 10 multiple choice questions.

Study Material:
"""
${text.slice(0, 4000)}
"""

Return ONLY a valid JSON array (no explanation, no markdown, no backticks) in this exact format:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 0
  }
]

The answer field is the index (0-3) of the correct option.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;
    const clean = raw.replace(/```json|```/g, '').trim();
    questions = JSON.parse(clean);
    startQuiz();
  } catch (err) {
    console.error(err);
    alert('Something went wrong! Check your API key and try again.');
    showScreen('homeScreen');
  }
}

// =====================
//  AI CALL — IMAGE
// =====================
async function generateQuizFromImage(base64Data, mediaType) {
  showScreen('loadingScreen');
  animateLoadingSteps();

  const API_KEY = document.getElementById('apiKeyInput').value.trim();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Data } },
            { text: 'Generate exactly 10 multiple choice questions from this image. Return ONLY a valid JSON array (no markdown, no backticks): [{"question":"...","options":["A","B","C","D"],"answer":0}]. The answer field is the index (0-3) of the correct option.' }
          ]
        }]
      })
    });

    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;
    const clean = raw.replace(/```json|```/g, '').trim();
    questions = JSON.parse(clean);
    startQuiz();
  } catch (err) {
    console.error(err);
    alert('Could not process the image. Try pasting text instead.');
    showScreen('homeScreen');
  }
}
// =====================
//  LOADING ANIMATION
// =====================
function animateLoadingSteps() {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  let i = 0;
  const interval = setInterval(() => {
    if (i > 0) document.getElementById(steps[i - 1]).classList.replace('active', 'done');
    if (i < steps.length) {
      document.getElementById(steps[i]).classList.add('active');
      i++;
    } else {
      clearInterval(interval);
    }
  }, 900);
}

// =====================
//  QUIZ ENGINE
// =====================
function startQuiz() {
  currentQ = 0;
  score = 0;
  userAnswers = [];
  showScreen('quizScreen');
  renderQuestion();
}

function renderQuestion() {
  answered = false;
  timeLeft = 30;

  const q = questions[currentQ];
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('questionCounter').textContent = `Q ${currentQ + 1} / ${questions.length}`;
  document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
  document.getElementById('progressFill').style.width = `${((currentQ + 1) / questions.length) * 100}%`;
  document.getElementById('nextBtn').style.display = 'none';

  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];

  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-label">${labels[idx]}</span>${opt}`;
    btn.addEventListener('click', () => selectAnswer(idx, q.answer));
    grid.appendChild(btn);
  });

  startTimer();
}

function startTimer() {
  clearInterval(timer);
  updateTimerUI();

  timer = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) {
      clearInterval(timer);
      if (!answered) timeUp();
    }
  }, 1000);
}

function updateTimerUI() {
  const box = document.getElementById('timerBox');
  document.getElementById('timerDisplay').textContent = timeLeft;
  box.className = 'timer-box';
  if (timeLeft <= 10) box.classList.add('warning');
  if (timeLeft <= 5)  box.classList.add('danger');
}

function selectAnswer(selected, correct) {
  if (answered) return;
  answered = true;
  clearInterval(timer);

  const btns = document.querySelectorAll('.option-btn');
  btns.forEach(b => b.disabled = true);

  const isCorrect = selected === correct;
  if (isCorrect) score++;

  btns[selected].classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) btns[correct].classList.add('correct');

  userAnswers.push({ question: questions[currentQ].question, selected, correct, isCorrect });

  document.getElementById('nextBtn').style.display = 'block';
  document.getElementById('nextBtn').textContent =
    currentQ + 1 < questions.length ? 'Next Question →' : 'See Results 🎯';
}

function timeUp() {
  answered = true;
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach(b => b.disabled = true);
  btns[questions[currentQ].answer].classList.add('correct');
  userAnswers.push({ question: questions[currentQ].question, selected: -1, correct: questions[currentQ].answer, isCorrect: false });
  document.getElementById('nextBtn').style.display = 'block';
  document.getElementById('nextBtn').textContent =
    currentQ + 1 < questions.length ? 'Next Question →' : 'See Results 🎯';
}

document.getElementById('nextBtn').addEventListener('click', () => {
  currentQ++;
  if (currentQ < questions.length) {
    renderQuestion();
  } else {
    showResults();
  }
});

// =====================
//  RESULTS
// =====================
function showResults() {
  clearInterval(timer);
  showScreen('scoreScreen');

  const total = questions.length;
  const pct   = Math.round((score / total) * 100);

  document.getElementById('finalScore').textContent = `${score}/${total}`;

  let emoji, title, msg;
  if (pct === 100)      { emoji = '🏆'; title = 'Perfect Score!';   msg = 'Outstanding! You mastered every question.'; }
  else if (pct >= 80)   { emoji = '🎉'; title = 'Great Job!';        msg = `You got ${score} out of ${total} right. Excellent work!`; }
  else if (pct >= 60)   { emoji = '👍'; title = 'Good Effort!';      msg = `You got ${score} out of ${total}. A little more revision and you'll ace it!`; }
  else if (pct >= 40)   { emoji = '📚'; title = 'Keep Practicing!';  msg = `You got ${score} out of ${total}. Review the material and try again.`; }
  else                  { emoji = '💪'; title = 'Don\'t Give Up!';   msg = `You got ${score} out of ${total}. Study the topics and come back stronger!`; }

  document.getElementById('scoreEmoji').textContent = emoji;
  document.getElementById('scoreTitle').textContent = title;
  document.getElementById('scoreMessage').textContent = msg;

  const breakdown = document.getElementById('scoreBreakdown');
  breakdown.innerHTML = '';
  userAnswers.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = `breakdown-item ${a.isCorrect ? 'correct-item' : 'wrong-item'}`;
    item.innerHTML = `<span>${a.isCorrect ? '✅' : '❌'}</span><span>Q${i + 1}: ${a.question.slice(0, 60)}${a.question.length > 60 ? '…' : ''}</span>`;
    breakdown.appendChild(item);
  });
}

function restartQuiz() {
  startQuiz();
}

function goHome() {
  showScreen('homeScreen');
  document.getElementById('pasteText').value = '';
  fileInput.value = '';
  const icon  = uploadArea.querySelector('.upload-icon');
  const title = uploadArea.querySelector('.upload-title');
  const sub   = uploadArea.querySelector('.upload-sub');
  icon.textContent  = '📄';
  title.textContent = 'Drop your file here';
  sub.textContent   = 'Supports PDF, Image, or plain text';
}
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

// =====================
//  SCREEN MANAGER
// =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}