document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registrationForm');
    const studentIdInput = document.getElementById('studentId');
    const studentNameInput = document.getElementById('studentName');
    const startButton = document.getElementById('startButton');

    // 입력 필드 실시간 검증
    studentIdInput.addEventListener('input', validateStudentId);
    studentNameInput.addEventListener('input', validateStudentName);

    // 폼 제출 처리
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (validateForm()) {
            // 사용자 정보를 localStorage에 저장
            const userInfo = {
                studentId: studentIdInput.value.trim(),
                studentName: studentNameInput.value.trim(),
                loginTime: new Date().toISOString()
            };
            
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            // 운동 화면으로 이동
            window.location.href = 'exercise.html';
        }
    });

    function validateStudentId() {
        const studentId = studentIdInput.value.trim();
        const errorElement = document.getElementById('studentIdError');
        
        if (studentId.length === 0) {
            showError(errorElement, '학번을 입력해주세요');
            return false;
        } else if (!/^\d{8,10}$/.test(studentId)) {
            showError(errorElement, '8-10자리 숫자로 입력해주세요');
            return false;
        } else {
            hideError(errorElement);
            return true;
        }
    }

    function validateStudentName() {
        const studentName = studentNameInput.value.trim();
        const errorElement = document.getElementById('studentNameError');
        
        if (studentName.length === 0) {
            showError(errorElement, '이름을 입력해주세요');
            return false;
        } else if (studentName.length < 2) {
            showError(errorElement, '이름은 2글자 이상 입력해주세요');
            return false;
        } else if (!/^[가-힣a-zA-Z\s]+$/.test(studentName)) {
            showError(errorElement, '한글 또는 영문으로만 입력해주세요');
            return false;
        } else {
            hideError(errorElement);
            return true;
        }
    }

    function validateForm() {
        const isStudentIdValid = validateStudentId();
        const isStudentNameValid = validateStudentName();
        
        return isStudentIdValid && isStudentNameValid;
    }

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        element.parentElement.querySelector('input').style.borderColor = '#e74c3c';
    }

    function hideError(element) {
        element.style.display = 'none';
        element.parentElement.querySelector('input').style.borderColor = '#e1e5e9';
    }

    // 엔터 키로 폼 제출
    [studentIdInput, studentNameInput].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                form.dispatchEvent(new Event('submit'));
            }
        });
    });

    // 이전에 저장된 정보가 있다면 자동 입력 (개발/테스트 편의용)
    const savedUserInfo = localStorage.getItem('userInfo');
    if (savedUserInfo) {
        try {
            const userInfo = JSON.parse(savedUserInfo);
            studentIdInput.value = userInfo.studentId || '';
            studentNameInput.value = userInfo.studentName || '';
        } catch (e) {
            console.log('저장된 사용자 정보를 불러올 수 없습니다.');
        }
    }
}); 