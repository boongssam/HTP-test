import { createClient } from '@supabase/supabase-js';

// DOM 요소 가져오기
const studentNameInput = document.getElementById('studentName');
const imageUpload = document.getElementById('imageUpload');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');
const analyzeBtn = document.getElementById('analyzeBtn');

const loadingOverlay = document.getElementById('loadingOverlay');
const resultSection = document.getElementById('resultSection');
const resultStudentName = document.getElementById('resultStudentName');
const resultDate = document.getElementById('resultDate');
const resultContent = document.getElementById('resultContent');

const saveDbBtn = document.getElementById('saveDbBtn');
const saveStatus = document.getElementById('saveStatus');
const viewRecordsBtn = document.getElementById('viewRecordsBtn');
const closeRecordsBtn = document.getElementById('closeRecordsBtn');
const recordsSection = document.getElementById('recordsSection');
const recordsList = document.getElementById('recordsList');

// 상태 관리
let selectedFile = null;
let currentAnalysisResult = ''; // 저장할 결과 텍스트 보관

// Supabase 클라이언트 초기화 (필요할 때 지연 초기화)
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('여기에_')) {
      return null;
    }
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// 이벤트 리스너 설정
function initApp() {
  imageUpload.addEventListener('change', handleImageUpload);
  removeImageBtn.addEventListener('click', handleRemoveImage);
  studentNameInput.addEventListener('input', validateForm);
  analyzeBtn.addEventListener('click', handleAnalyze);
  
  saveDbBtn.addEventListener('click', handleSaveToDb);
  viewRecordsBtn.addEventListener('click', handleViewRecords);
  closeRecordsBtn.addEventListener('click', () => recordsSection.classList.add('hidden'));
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (file) {
    // 이미지 타입 검사 완화 (일부 윈도우 환경에서 type이 비어있는 경우가 있어 제외)
    // if (!file.type.startsWith('image/')) {
    //   alert('그림(이미지) 파일만 업로드할 수 있습니다.');
    //   return;
    // }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      document.querySelector('.file-upload-label').classList.add('hidden');
      previewContainer.classList.remove('hidden');
      validateForm();
    };
    reader.readAsDataURL(file);
  }
}

function handleRemoveImage() {
  selectedFile = null;
  imageUpload.value = ''; 
  previewContainer.classList.add('hidden');
  document.querySelector('.file-upload-label').classList.remove('hidden');
  validateForm();
}

function validateForm() {
  const isNameValid = studentNameInput.value.trim().length > 0;
  const isFileValid = selectedFile !== null;
  analyzeBtn.disabled = !(isNameValid && isFileValid);
}

function fileToGenerativePart(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: reader.result.split(',')[1],
          mimeType: file.type || 'image/jpeg' // MIME 타입이 비어있는 경우를 위한 기본값
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

const HTP_SYSTEM_INSTRUCTION = `너는 초등학교 학생의 심리 상태를 분석하는 따뜻하고 전문적인 아동 심리 상담사야. 
제공된 그림은 HTP(집, 나무, 사람) 검사 그림이야. 다음의 명확한 분석 기준을 바탕으로 그림을 살펴보고, 학생의 정서를 분석해줘.

[1. 집 (House) 분석 기준]
- 중심의 위치가 왼쪽인가?: 내향
- 위치가 오른쪽인가?: 외향
- 크기가 33% 이하인가?: 열등감, 무능력감
- 크기가 66% 이상인가?: 과장, 공격적, 보상적 방어기제

[2. 나무 (Tree) 분석 기준]
- 위치가 왼쪽인가?: 자신의 강함, 부끄러움 많음
- 위치가 오른쪽인가?: 지적 만족 강조, 부정적, 적개심
- 크기가 33% 이하인가?: 열등감, 무력감
- 크기가 90% 이상인가?: 일상속 회의감

[3. 사람 (Person) 분석 기준]
- 위치가 왼쪽인가?: 소극적, 우울감
- 위치가 오른쪽인가?: 이기적, 공격적
- 크기가 33% 이하인가?: 환경 적응 어려움, 에너지 낮음
- 크기가 67% 이상인가?: 자신 증명의 욕구

위 기준에 따라 이미지에서 집, 나무, 사람의 위치와 크기를 시각적으로 측정하고, 해당하는 해석을 도출해.
초등학교 선생님이 학생을 이해하고 지도하는 데 도움이 될 수 있도록, 분석 결과를 너무 단정적이거나 부정적으로만 쓰지 말고, 따뜻하고 부드러운 말투로 작성해줘.
결과는 가독성이 좋게 마크다운(##, -, ** 등)을 사용해서 정리해줘.`;

async function handleAnalyze() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('여기에_')) {
    alert('.env 파일에 제미나이 API 키를 입력해주세요!');
    return;
  }

  try {
    analyzeBtn.disabled = true;
    loadingOverlay.classList.remove('hidden');
    resultSection.classList.add('hidden');
    document.querySelector('.upload-section').classList.add('hidden');
    saveStatus.classList.add('hidden');
    saveDbBtn.disabled = false;

    const imagePart = await fileToGenerativePart(selectedFile);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [ { text: "이 HTP 그림을 분석해주세요." }, imagePart ]
          }],
          systemInstruction: { parts: [{ text: HTP_SYSTEM_INSTRUCTION }] },
          generationConfig: { temperature: 0.3 }
        })
      }
    );

    if (!response.ok) throw new Error(`API 호출 실패 (${response.status})`);

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    currentAnalysisResult = resultText; // 저장을 위해 원본 보관

    let formattedResult = resultText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/- (.*?)\n/g, '<ul><li>$1</li></ul>')
      .replace(/<\/ul>\n<ul>/g, '')
      .replace(/\n/g, '<br/>');

    const today = new Date();
    const dateString = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    
    resultStudentName.textContent = studentNameInput.value;
    resultDate.textContent = dateString;
    resultContent.innerHTML = formattedResult;

    loadingOverlay.classList.add('hidden');
    resultSection.classList.remove('hidden');
    document.querySelector('.upload-section').classList.remove('hidden');

  } catch (error) {
    console.error('분석 에러:', error);
    alert('그림 분석 중 오류가 발생했습니다.\n상세 오류: ' + error.message);
    loadingOverlay.classList.add('hidden');
    document.querySelector('.upload-section').classList.remove('hidden');
    analyzeBtn.disabled = false;
  }
}

async function handleSaveToDb() {
  const client = getSupabaseClient();
  if (!client) {
    alert('.env 파일에 Supabase URL과 KEY가 올바르게 설정되지 않았습니다.');
    return;
  }

  try {
    saveDbBtn.disabled = true;
    saveDbBtn.textContent = '저장 중...';

    const { error } = await client
      .from('htp_results')
      .insert([
        { 
          student_name: studentNameInput.value, 
          analysis_result: currentAnalysisResult 
        }
      ]);

    if (error) throw error;

    saveStatus.textContent = '✅ 안전하게 저장되었습니다!';
    saveStatus.classList.remove('hidden');
    saveDbBtn.textContent = '저장 완료';
    
  } catch (error) {
    console.error('저장 에러:', error);
    alert('데이터베이스 저장 중 오류가 발생했습니다.\n' + error.message);
    saveDbBtn.disabled = false;
    saveDbBtn.textContent = '💾 이 결과를 안전하게 저장하기';
  }
}

async function handleViewRecords() {
  const client = getSupabaseClient();
  if (!client) {
    alert('.env 파일에 Supabase 설정을 확인해주세요.');
    return;
  }

  recordsSection.classList.remove('hidden');
  recordsList.innerHTML = '<p style="text-align:center;">기록을 불러오는 중입니다...</p>';

  try {
    const { data, error } = await client
      .from('htp_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (data.length === 0) {
      recordsList.innerHTML = '<p style="text-align:center; color:#a4b0be;">아직 저장된 기록이 없습니다.</p>';
      return;
    }

    recordsList.innerHTML = '';
    data.forEach(record => {
      const dateStr = new Date(record.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      const item = document.createElement('div');
      item.className = 'record-item';
      
      // 마크다운 제거
      const plainText = record.analysis_result.replace(/#/g, '').replace(/\*/g, '');

      item.innerHTML = `
        <div class="record-item-header">
          <span class="record-item-name">${record.student_name}</span>
          <span class="record-item-date">${dateStr}</span>
        </div>
        <div class="record-item-content">${plainText}</div>
        <button class="expand-btn">더보기</button>
      `;

      const expandBtn = item.querySelector('.expand-btn');
      const content = item.querySelector('.record-item-content');
      
      expandBtn.addEventListener('click', () => {
        content.classList.toggle('expanded');
        expandBtn.textContent = content.classList.contains('expanded') ? '접기' : '더보기';
      });

      recordsList.appendChild(item);
    });

  } catch (error) {
    console.error('조회 에러:', error);
    recordsList.innerHTML = '<p style="text-align:center; color:#ff6b81;">기록을 불러오는데 실패했습니다.</p>';
  }
}

document.addEventListener('DOMContentLoaded', initApp);
