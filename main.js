// === 사용자 정보 로드 및 검증 ===
function loadUserInfo() {
    const savedUserInfo = localStorage.getItem('userInfo');
    
    if (!savedUserInfo) {
        alert('사용자 정보가 없습니다. 등록 화면으로 이동합니다.');
        window.location.href = 'index.html';
        return null;
    }
    
    try {
        const userInfo = JSON.parse(savedUserInfo);
        
        // 사용자 정보 표시
        document.getElementById('displayStudentId').textContent = `학번: ${userInfo.studentId}`;
        document.getElementById('displayStudentName').textContent = `이름: ${userInfo.studentName}`;
        
        console.log('사용자 정보 로드 완료:', userInfo);
        return userInfo;
    } catch (error) {
        console.error('사용자 정보 파싱 오류:', error);
        alert('사용자 정보가 손상되었습니다. 다시 등록해주세요.');
        window.location.href = 'index.html';
        return null;
    }
}

// 페이지 로드 시 사용자 정보 로드
const currentUser = loadUserInfo();

const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
const user_video = document.getElementById("webcam-video");
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const mistake = new Audio('resource/mistake.mp3'); // 이승하 수정

// --- 새로운 전역 변수 ---
let programState = 'waiting_for_ready'; // 프로그램 상태: 'waiting_for_ready' 또는 'exercise_active'
let readyPoseSustainedStart = 0; // 준비 자세 유지 시작 시간
const READY_POSE_HOLD_DURATION = 2000; // 준비 자세를 유지해야 하는 시간 (밀리초)

// 유틸리티 함수: 두 점 사이의 거리 계산
function distance(P1, P2) {
    if (!P1 || !P2) return Infinity;
    return Math.sqrt((P1.x - P2.x) ** 2 + (P1.y - P2.y) ** 2);
}

// 유틸리티 함수: 라디안을 각도로 변환 (원본 오타 degress -> degrees 수정)
function degrees(radians) {
    return radians * (180 / Math.PI);
}

// 유틸리티 함수: 세 점으로 각도 계산 (P2가 꼭짓점)
function angle(P1, P2, P3) {
    if (!P1 || !P2 || !P3) return 0;
    // 원본 코드의 degress를 degrees로 수정
    var result = degrees(Math.atan2(P3.y - P2.y, P3.x - P2.x) -
        Math.atan2(P1.y - P2.y, P1.x - P2.x));
    if (result < 0) {
        result += 360;
    }
    return result;
}

// <--- 안득하 수정 (Python) -> 원본 주석 유지
var cnt = 0;
var flag = 0;
var sound_flag = 1;
var chk_cnt = 0;
// --->

// <--- 이승하 수정 (2024.11.15) -> 원본 주석 유지
var exercise_name = "언더 핸드 패스";
var error = "";
// -->

function onPose(results) {
    canvasCtx.save();   // 캔버스 설정 저장
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height); // 캔버스 초기화

    // 캔버스에 이미지 넣기
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // 랜드마크가 감지되지 않은 경우 처리
    if (!results.poseLandmarks) {
        canvasCtx.fillStyle = "red";
        canvasCtx.font = "italic bold 15px Arial, sans-serif";
        canvasCtx.fillText("인식불가", 10, 20);

        // 운동 활성 상태였다면 카운트 표시 (준비 상태에서는 카운트 의미 없음)
        if (programState === 'exercise_active') {
            canvasCtx.fillStyle = "blue";
            canvasCtx.font = "italic bold 20px Arial, sans-serif";
            canvasCtx.fillText(cnt.toString(), 10, 40);
        }
        canvasCtx.restore();
        return;
    }

    const points = results.poseLandmarks; // 감지된 랜드마크

    // --- 준비 자세 대기 상태 ---
    if (programState === 'waiting_for_ready') {
        canvasCtx.fillStyle = "orange";
        canvasCtx.font = "italic bold 17px Arial, sans-serif";
        canvasCtx.textAlign = "center";
        canvasCtx.fillText("준비: 오른손을 위로 곧게 펴세요!", canvasElement.width / 2, 30);
        canvasCtx.textAlign = "left"; // 정렬 초기화

        // 준비 자세 관련 랜드마크 (숫자 인덱스 사용)
        // 0: 코, 12: 오른쪽 어깨, 14: 오른쪽 팔꿈치, 16: 오른쪽 손목
        const nose = points[0];
        const rightShoulder = points[12];
        const rightElbow = points[14];
        const rightWrist = points[16];

        if (rightWrist && rightElbow && rightShoulder && nose) {
            const armAngle = angle(points[12], points[14], points[16]); // 오른쪽 팔꿈치 각도

            // 조건 1: 오른손이 오른쪽 어깨와 코보다 위에 있는가? (Y 좌표는 위로 갈수록 작아짐)
            const isHandHighEnough = rightWrist.y < rightShoulder.y && rightWrist.y < nose.y;
            // 조건 2: 오른팔이 펴져 있는가? (팔꿈치 각도가 180도에 가까운가?)
            const isArmStraightReady = armAngle > 160 && armAngle < 200; // 160-200도 사이면 편 것으로 간주
            // 조건 3: 팔꿈치가 어깨보다 너무 아래로 처지지 않았는가? (Y 좌표 비교)
            // 어깨 Y좌표보다 팔꿈치 Y좌표가 작거나 비슷한 수준 (너무 많이 내려가지 않도록)
            const isElbowPositioned = rightElbow.y < rightShoulder.y + (canvasElement.height * 0.05);


            if (isHandHighEnough && isArmStraightReady && isElbowPositioned) {
                if (readyPoseSustainedStart === 0) {
                    readyPoseSustainedStart = Date.now(); // 자세 유지 시작 시간 기록
                }
                const sustainedTime = Date.now() - readyPoseSustainedStart;
                const progress = Math.min(sustainedTime / READY_POSE_HOLD_DURATION, 1);

                canvasCtx.fillStyle = "lightgreen";
                canvasCtx.font = "italic bold 18px Arial, sans-serif";
                canvasCtx.fillText(`준비 자세 감지됨! (${Math.round(progress * 100)}%)`, 10, 60);

                // 진행률 바 그리기
                canvasCtx.fillStyle = "gray";
                canvasCtx.fillRect(10, 80, 200, 20); // 바 배경
                canvasCtx.fillStyle = "green";
                canvasCtx.fillRect(10, 80, 200 * progress, 20); // 진행률

                if (sustainedTime >= READY_POSE_HOLD_DURATION) {
                    programState = 'exercise_active'; // 운동 활성 상태로 전환
                    console.log('🔥 운동 활성 상태로 전환됨!');
                    
                    // 운동 관련 변수 초기화 (원본 코드의 변수들)
                    cnt = 0;
                    flag = 0;
                    sound_flag = 1;
                    chk_cnt = 0;
                    error = "";
                    readyPoseSustainedStart = 0; // 타이머 초기화
                    
                    // 중지 버튼 강제 표시
                    setTimeout(() => {
                        const stopButton = document.getElementById('stopButton');
                        if (stopButton) {
                            stopButton.style.setProperty('display', 'block', 'important');
                            stopButton.style.setProperty('visibility', 'visible', 'important');
                            stopButton.style.setProperty('opacity', '1', 'important');
                            console.log('✅ 중지 버튼 강제 표시됨!');
                        } else {
                            console.log('❌ 중지 버튼을 찾을 수 없음');
                        }
                    }, 100); // 약간의 지연 후 표시


                    canvasCtx.fillStyle = "green";
                    canvasCtx.font = "bold 25px Arial, sans-serif";
                    canvasCtx.textAlign = "center";
                    canvasCtx.fillText("준비 완료! 운동 시작!", canvasElement.width / 2, canvasElement.height / 2);
                    canvasCtx.textAlign = "left";
                }
            } else {
                readyPoseSustainedStart = 0; // 자세가 올바르지 않으면 타이머 초기화
                canvasCtx.fillStyle = "yellow";
                canvasCtx.font = "italic bold 18px Arial, sans-serif";
                canvasCtx.fillText("자세를 유지해주세요...", 10, 60);
            }
        } else {
            readyPoseSustainedStart = 0; // 주요 랜드마크 미감지 시 타이머 초기화
            canvasCtx.fillStyle = "yellow";
            canvasCtx.font = "italic bold 18px Arial, sans-serif";
            canvasCtx.fillText("오른팔 주요 부위가 감지되지 않습니다.", 10, 60);
        }
        // 준비 자세 중에도 랜드마크 표시 (초록색 계열)
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#00FF00', lineWidth: 2 });
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00CC00', lineWidth: 3 });

    // --- 운동 활성 상태 (원본 코드의 운동 인식 로직) ---
    } else if (programState === 'exercise_active') {
        // 중지 버튼이 확실히 보이도록 강제 체크
        const stopButton = document.getElementById('stopButton');
        if (stopButton) {
            const computedStyle = window.getComputedStyle(stopButton);
            if (computedStyle.display === 'none' || stopButton.style.display === 'none') {
                stopButton.style.setProperty('display', 'block', 'important');
                stopButton.style.setProperty('visibility', 'visible', 'important');
                stopButton.style.setProperty('opacity', '1', 'important');
                console.log('🔄 운동 중 중지 버튼 강제 재표시');
            }
        } else {
            console.log('❌ 운동 중인데 중지 버튼을 찾을 수 없음');
        }
        
        canvasCtx.fillStyle = "green";
        canvasCtx.font = "italic bold 20px Arial, sans-serif";
        // 원본 코드에서는 운동 이름 표시 위치가 canvasElement.width - 70, 20 이었음
        const exerciseTextWidth = canvasCtx.measureText(exercise_name).width;
        canvasCtx.fillText(exercise_name, canvasElement.width - exerciseTextWidth - 10, 20); // 오른쪽 정렬 느낌으로


        drawLandmarks(canvasCtx, results.poseLandmarks, {   // 랜드마크 표시
            color: '#FF0000', lineWidth: 2
        });
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { // 연결 선 표시
            color: '#0000FF', lineWidth: 3
        });
        // canvasCtx.restore(); // restore는 함수의 맨 마지막으로 이동

        // <--- 안득하 수정 (Python) -> 원본 주석 유지 (이 부분은 이미 위에서 처리됨)
        // if (results.poseLandmarks == null) { ... } -> 이 부분은 함수 상단으로 이동하여 공통 처리

        // var points = results.poseLandmarks; // 이미 함수 상단에서 정의됨
        var angL = angle(points[11],points[13],points[15]); 
        var angR = angle(points[12],points[14],points[16]);
        var angL2 = angle(points[23],points[25],points[27]); 
        var angR2 = angle(points[24],points[26],points[28]); // 각도 계산

        var pos = 0;
        var posTxt = "";
        var color = "";

        // 원본 코드의 자세 판정 로직 (수정 없음)
        if (220 < angL || 150 > angR ) {
            pos = 3;
            posTxt = "BAD";
            color = "red";
        } else if ( (distance(points[15], points[25]) < distance(points[11], points[23]) || 
                    distance(points[16], points[26]) < distance(points[12], points[24])) && 
                    (angL2 > 210 || angL2 < 150 || angR2 > 210 || angR2 < 150)) {
            pos = 1;
            posTxt = "DOWN";
            color = "blue";
        } else if ( (distance(points[15], points[25]) > distance(points[11], points[23]) || 
                    distance(points[16], points[26]) > distance(points[12], points[24])) && 
                    (angL2 < 210 && angL2 > 150 && angR2 < 210 && angR2 > 150)) {
            pos = 2;
            posTxt = "HIT";
            color = "green";
        }

        // 이승하 수정 시작 (원본 코드의 switch 문)
        switch (pos) {
            case 1: { // DOWN
                flag = 1;         // DOWN 상태 기록
                sound_flag = 1;
                chk_cnt = 0;
                error = "";
                break;
            }
            case 2: { // HIT
                if (flag == 1) {  // 이전에 DOWN이었다면
                    cnt++;        // 카운트 증가
                    flag = 0;     // 플래그 초기화
                    
                    console.log(`운동 횟수: ${cnt}`);
                }
                sound_flag = 1;
                chk_cnt = 0;
                error = "";
                break;
            }
            case 3: { // BAD
                flag = 0;         // BAD 상태에서는 플래그 초기화
                if (sound_flag == 1) {
                    mistake.currentTime = 0;
                    error = "팔을 구부리지 말고 펴고 하세요.";
                    mistake.play();
                    sound_flag = 0;
                }
                chk_cnt++;
                if (chk_cnt > 100) {
                    sound_flag = 1;
                    chk_cnt = 0;
                }
                break;
            }
        }

        canvasCtx.fillStyle = color;
        canvasCtx.font = "italic bold 20px Arial, sans-serif";
        canvasCtx.fillText(posTxt, 10, 20);

        canvasCtx.fillStyle = "blue";
        canvasCtx.fillText(cnt.toString(), 10, 40);
        
        // 버튼 상태 디버깅 (5초마다 한 번)
        if (Date.now() % 5000 < 50) {
            const stopButton = document.getElementById('stopButton');
            if (stopButton) {
                const computedStyle = window.getComputedStyle(stopButton);
                console.log('🔍 버튼 상태 체크:', {
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    zIndex: computedStyle.zIndex
                });
            }
        }

        // HTML 요소에 오류 메시지 표시 (원본 코드와 동일)
        const errorElement = document.getElementById("error");
        if (errorElement) { // errorElement가 존재하는지 확인
            if (error != "") {
                errorElement.innerText = error;
                errorElement.style.display = 'block';
            } else {
                errorElement.style.display = 'none';
            }
        }
        // 끝 -> 원본 주석 유지

        console.log(posTxt); // 원본 코드와 동일
    } else if (programState === 'stopped') {
        // 중지된 상태에서는 버튼 숨기기
        const stopButton = document.getElementById('stopButton');
        if (stopButton) {
            stopButton.style.display = 'none';
        }
        
        // 중지 메시지 계속 표시
        canvasCtx.fillStyle = "red";
        canvasCtx.font = "bold 30px Arial, sans-serif";
        canvasCtx.textAlign = "center";
        canvasCtx.fillText("운동이 중지되었습니다!", canvasElement.width / 2, canvasElement.height / 2);
        canvasCtx.textAlign = "left";
    }
    canvasCtx.restore();    // 캔버스 설정 불러오기 (함수 마지막으로 이동)
}

pose.setOptions({ // 원본 코드와 동일
    upperBodyOnly: false,
    modelComplexity: 1,
    smoothLandmarks: false, // 원본은 false 였음. true로 하면 더 부드러워지나, 원본 유지.
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onPose);
let camera = new Camera(user_video, { // 원본 코드와 동일
    onFrame: async () => {
        await pose.send({ image: user_video });
    },
    width: 1280,
    height: 720
});
camera.start();

// 운동 데이터를 서버에 저장하는 함수
function saveExerciseData() {
    if (!currentUser) {
        console.error('사용자 정보가 없습니다.');
        return;
    }
    
    const exerciseData = {
        student_id: currentUser.studentId,
        student_name: currentUser.studentName,
        exercise_type: '언더 핸드 패스',
        count: cnt
    };
    
    fetch('/api/save-exercise', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(exerciseData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('운동 데이터가 저장되었습니다:', data.data);
            alert(`운동 기록이 저장되었습니다!\n횟수: ${cnt}회`);
        } else {
            console.error('저장 실패:', data.error);
            alert('데이터 저장에 실패했습니다.');
        }
    })
    .catch(error => {
        console.error('서버 오류:', error);
        alert('서버와 통신 중 오류가 발생했습니다.');
    });
}

// 운동 데이터를 저장하고 초기 화면으로 이동하는 함수
function saveExerciseDataAndRedirect() {
    if (!currentUser) {
        console.error('사용자 정보가 없습니다.');
        alert('사용자 정보가 없습니다. 초기 화면으로 이동합니다.');
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
        return;
    }
    
    const exerciseData = {
        student_id: currentUser.studentId,
        student_name: currentUser.studentName,
        exercise_type: '언더 핸드 패스',
        count: cnt
    };
    
    console.log('저장할 데이터:', exerciseData);
    
    fetch('/api/save-exercise', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(exerciseData)
    })
    .then(response => {
        console.log('응답 상태:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('서버 응답:', data);
        if (data.success) {
            console.log('운동 데이터가 저장되었습니다:', data.data);
            alert(`운동 기록이 저장되었습니다!\n학번: ${currentUser.studentId}\n이름: ${currentUser.studentName}\n운동: ${exerciseData.exercise_type}\n횟수: ${cnt}회\n\n초기 화면으로 이동합니다.`);
            
            // 초기 화면으로 이동
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            console.error('저장 실패:', data.error);
            alert(`데이터 저장에 실패했습니다: ${data.error}`);
            
            // 실패해도 초기 화면으로 이동
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
    })
    .catch(error => {
        console.error('네트워크 오류:', error);
        alert(`서버와 통신 중 오류가 발생했습니다: ${error.message}`);
        
        // 오류가 발생해도 초기 화면으로 이동
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    });
}

// 중지 버튼 클릭 이벤트
function stopExercise() {
    console.log('stopExercise 함수가 호출되었습니다. 현재 상태:', programState, '카운트:', cnt);
    
    if (programState === 'exercise_active') {
        // 운동 중지
        programState = 'stopped';
        
        // 중지 버튼 숨기기
        const stopButton = document.getElementById('stopButton');
        if (stopButton) {
            stopButton.style.display = 'none';
        }
        
        if (cnt > 0) {
            // 데이터 저장 후 초기 화면으로 이동
            console.log('운동 횟수가', cnt, '회이므로 데이터를 저장합니다.');
            saveExerciseDataAndRedirect();
        } else {
            alert('운동 횟수가 0회입니다. 초기 화면으로 이동합니다.');
            // 초기 화면으로 이동
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
        
        console.log('운동이 중지되었습니다. 최종 횟수:', cnt);
    } else {
        console.log('운동이 활성 상태가 아닙니다. 현재 상태:', programState);
        alert(`이제 운동을 중지하겠습니다다. (상태: ${programState})`);
    }
}

// 전역 함수로도 등록
window.stopExercise = stopExercise;

// 페이지 로드 완료 후 초기 설정
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM 로드 완료');
    
    // 처음에는 중지 버튼 숨기기
    const stopButton = document.getElementById('stopButton');
    if (stopButton) {
        stopButton.style.display = 'none';
        console.log('페이지 로드 - 중지 버튼 숨김');
        
        // 이벤트 리스너도 추가 (onclick 속성 외에 추가 보안)
        stopButton.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('중지 버튼이 클릭되었습니다 (addEventListener)');
            stopExercise();
        });
    } else {
        console.log('중지 버튼을 찾을 수 없습니다');
    }
});
