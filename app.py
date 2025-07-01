from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import datetime
import os
import hashlib
import secrets
import urllib.parse

app = Flask(__name__)
CORS(app)  # CORS 허용

# 데이터베이스 설정
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///exercise_data.db')
USE_POSTGRESQL = DATABASE_URL.startswith('postgres')

if USE_POSTGRESQL:
    import psycopg2
    import psycopg2.extras
    
    def get_db_connection():
        try:
            # Heroku/Railway PostgreSQL URL 파싱
            if DATABASE_URL.startswith('postgres://'):
                DATABASE_URL_FIXED = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
            else:
                DATABASE_URL_FIXED = DATABASE_URL
                
            conn = psycopg2.connect(DATABASE_URL_FIXED)
            return conn
        except Exception as e:
            print(f"PostgreSQL 연결 실패: {str(e)}")
            print("SQLite로 폴백합니다...")
            # PostgreSQL 연결 실패 시 SQLite로 폴백
            global USE_POSTGRESQL
            USE_POSTGRESQL = False
            return sqlite3.connect('exercise_data.db')
else:
    def get_db_connection():
        return sqlite3.connect('exercise_data.db')

# 데이터베이스 초기화
def init_db():
    try:
        print(f"데이터베이스 초기화 시작... USE_POSTGRESQL: {USE_POSTGRESQL}")
        
        if USE_POSTGRESQL:
            print("PostgreSQL 테이블 생성 시도")
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS exercise_records (
                    id SERIAL PRIMARY KEY,
                    student_id VARCHAR(20) NOT NULL,
                    student_name VARCHAR(100) NOT NULL,
                    exercise_type VARCHAR(100) NOT NULL DEFAULT '언더 핸드 패스',
                    exercise_date VARCHAR(50) NOT NULL,
                    count INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            print("PostgreSQL 테이블 생성 완료")
            conn.close()
        else:
            print("SQLite 테이블 생성 시도")
            conn = sqlite3.connect('exercise_data.db')
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS exercise_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    student_name TEXT NOT NULL,
                    exercise_type TEXT NOT NULL,
                    exercise_date TEXT NOT NULL,
                    count INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 기존 테이블에 exercise_type 컬럼이 없다면 추가
            try:
                cursor.execute("ALTER TABLE exercise_records ADD COLUMN exercise_type TEXT DEFAULT '언더 핸드 패스'")
                print("exercise_type 컬럼 추가")
            except sqlite3.OperationalError:
                # 컬럼이 이미 존재하는 경우
                print("exercise_type 컬럼 이미 존재")
                pass
            
            conn.commit()
            print("SQLite 테이블 생성 완료")
            conn.close()
        
        print("데이터베이스 초기화 성공")
        
    except Exception as e:
        print(f"데이터베이스 초기화 오류: {str(e)}")
        print(f"오류 타입: {type(e)}")
        import traceback
        print(f"스택 트레이스: {traceback.format_exc()}")
        # 초기화 실패 시에도 앱이 시작되도록 함
        pass

# 정적 파일 서빙 (HTML, CSS, JS)
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

# 운동 데이터 저장 API
@app.route('/api/save-exercise', methods=['POST'])
def save_exercise():
    try:
        print("=== 운동 데이터 저장 요청 받음 ===")
        data = request.json
        print(f"받은 데이터: {data}")
        
        student_id = data.get('student_id')
        student_name = data.get('student_name')
        exercise_type = data.get('exercise_type', '언더 핸드 패스')  # 기본값 설정
        count = data.get('count')
        
        # 현재 시간을 정확하게 가져오기
        current_time = datetime.datetime.now()
        exercise_date = current_time.strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"처리할 데이터: student_id={student_id}, student_name={student_name}, exercise_type={exercise_type}, count={count}")
        print(f"저장 시간: {exercise_date}")
        
        # 데이터 검증
        if not student_id or not student_name or count is None:
            print("데이터 검증 실패: 필수 데이터 누락")
            return jsonify({'error': '필수 데이터가 누락되었습니다'}), 400
        
        # 데이터베이스에 저장
        print(f"데이터베이스 연결 시도... USE_POSTGRESQL: {USE_POSTGRESQL}")
        
        try:
            conn = get_db_connection()
            print("데이터베이스 연결 성공")
            cursor = conn.cursor()
            
            if USE_POSTGRESQL:
                print("PostgreSQL 모드로 데이터 삽입 시도")
                cursor.execute('''
                    INSERT INTO exercise_records (student_id, student_name, exercise_type, exercise_date, count, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (student_id, student_name, exercise_type, exercise_date, count, exercise_date))
            else:
                print("SQLite 모드로 데이터 삽입 시도")
                cursor.execute('''
                    INSERT INTO exercise_records (student_id, student_name, exercise_type, exercise_date, count, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (student_id, student_name, exercise_type, exercise_date, count, exercise_date))
            
            conn.commit()
            print("데이터베이스 커밋 완료")
            conn.close()
            print("데이터베이스 연결 종료")
            
            print(f"데이터베이스 저장 성공: {student_id}, {student_name}, {exercise_type}, {count}회")
            
            return jsonify({
                'success': True,
                'message': '데이터가 성공적으로 저장되었습니다',
                'data': {
                    'student_id': student_id,
                    'student_name': student_name,
                    'exercise_type': exercise_type,
                    'exercise_date': exercise_date,
                    'count': count
                }
            })
            
        except Exception as db_error:
            print(f"데이터베이스 오류: {str(db_error)}")
            print(f"오류 타입: {type(db_error)}")
            import traceback
            print(f"스택 트레이스: {traceback.format_exc()}")
            return jsonify({'error': f'데이터베이스 오류: {str(db_error)}'}), 500
        
    except Exception as e:
        print(f"전체 오류: {str(e)}")
        print(f"오류 타입: {type(e)}")
        import traceback
        print(f"스택 트레이스: {traceback.format_exc()}")
        return jsonify({'error': f'서버 오류: {str(e)}'}), 500

# 관리자 로그인 API
@app.route('/api/admin-login', methods=['POST'])
def admin_login():
    try:
        data = request.json
        admin_id = data.get('admin_id')
        admin_password = data.get('admin_password')
        
        # 간단한 관리자 인증 (실제 운영에서는 더 안전한 방법 사용)
        if admin_id == 'admin' and admin_password == 'admin123':
            # 토큰 생성
            token = secrets.token_hex(32)
            
            return jsonify({
                'success': True,
                'token': token,
                'message': '로그인 성공'
            })
        else:
            return jsonify({
                'success': False,
                'message': '잘못된 관리자 정보입니다'
            }), 401
            
    except Exception as e:
        return jsonify({'error': f'서버 오류: {str(e)}'}), 500

# 운동 기록 조회 API (관리자용)
@app.route('/api/get-records', methods=['GET'])
def get_records():
    try:
        # 관리자 인증 확인 (실제 운영에서는 더 안전한 토큰 검증 필요)
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'error': '인증이 필요합니다'}), 401
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 모든 기록 조회 (ID 포함)
        cursor.execute('''
            SELECT id, student_id, student_name, exercise_type, exercise_date, count, created_at
            FROM exercise_records
            ORDER BY created_at DESC
            LIMIT 100
        ''')
        
        records = []
        for row in cursor.fetchall():
            records.append({
                'id': row[0],
                'student_id': row[1],
                'student_name': row[2],
                'exercise_type': row[3] if row[3] else '언더 핸드 패스',  # NULL 값 처리
                'exercise_date': row[4],
                'count': row[5],
                'created_at': str(row[6]) if row[6] else None
            })
        
        # 통계 정보 조회
        cursor.execute('''
            SELECT 
                COUNT(DISTINCT student_id) as total_students,
                COUNT(*) as total_records,
                AVG(count) as avg_count
            FROM exercise_records
        ''')
        stats_row = cursor.fetchone()
        
        # 오늘 기록 수 조회
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        if USE_POSTGRESQL:
            cursor.execute('''
                SELECT COUNT(*) FROM exercise_records 
                WHERE DATE(created_at) = %s
            ''', (today,))
        else:
            cursor.execute('''
                SELECT COUNT(*) FROM exercise_records 
                WHERE DATE(created_at) = ?
            ''', (today,))
        today_records = cursor.fetchone()[0]
        
        conn.close()
        
        stats = {
            'total_students': stats_row[0] if stats_row[0] else 0,
            'total_records': stats_row[1] if stats_row[1] else 0,
            'avg_count': stats_row[2] if stats_row[2] else 0,
            'today_records': today_records
        }
        
        return jsonify({
            'success': True,
            'records': records,
            'stats': stats
        })
        
    except Exception as e:
        return jsonify({'error': f'서버 오류: {str(e)}'}), 500

# 운동 기록 삭제 API (관리자용)
@app.route('/api/delete-record/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    try:
        print(f"=== 레코드 삭제 요청: ID {record_id} ===")
        
        # 관리자 인증 확인
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            print("인증 실패: 토큰 없음")
            return jsonify({'success': False, 'error': '인증이 필요합니다'}), 401
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 삭제할 레코드 확인
        if USE_POSTGRESQL:
            cursor.execute('SELECT * FROM exercise_records WHERE id = %s', (record_id,))
        else:
            cursor.execute('SELECT * FROM exercise_records WHERE id = ?', (record_id,))
        
        record = cursor.fetchone()
        if not record:
            print(f"레코드 없음: ID {record_id}")
            conn.close()
            return jsonify({'success': False, 'error': '해당 레코드를 찾을 수 없습니다'}), 404
        
        print(f"삭제할 레코드 확인: {record}")
        
        # 레코드 삭제
        if USE_POSTGRESQL:
            cursor.execute('DELETE FROM exercise_records WHERE id = %s', (record_id,))
        else:
            cursor.execute('DELETE FROM exercise_records WHERE id = ?', (record_id,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()
        
        print(f"레코드 삭제 성공: ID {record_id}, 삭제된 행 수: {deleted_count}")
        
        return jsonify({
            'success': True,
            'message': '레코드가 성공적으로 삭제되었습니다'
        })
        
    except Exception as e:
        print(f"레코드 삭제 오류: {str(e)}")
        return jsonify({'success': False, 'error': f'서버 오류: {str(e)}'}), 500

# 모든 데이터 삭제 API (관리자용)
@app.route('/api/delete-all-records', methods=['DELETE'])
def delete_all_records():
    try:
        # 관리자 인증 확인
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'error': '인증이 필요합니다'}), 401
        
        # 추가 보안을 위한 확인 키 검증
        data = request.json
        confirm_key = data.get('confirm_key')
        if confirm_key != 'DELETE_ALL_CONFIRM':
            return jsonify({'success': False, 'error': '확인 키가 올바르지 않습니다'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 모든 레코드 삭제
        cursor.execute('DELETE FROM exercise_records')
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        print(f"모든 레코드 삭제 성공: {deleted_count}개 레코드")
        
        return jsonify({
            'success': True,
            'message': f'{deleted_count}개의 모든 레코드가 삭제되었습니다'
        })
        
    except Exception as e:
        return jsonify({'error': f'서버 오류: {str(e)}'}), 500

if __name__ == '__main__':
    init_db()  # 데이터베이스 초기화
    print("데이터베이스가 초기화되었습니다.")
    
    # 배포 환경에서는 환경 변수에서 포트를 가져옴
    port = int(os.environ.get('PORT', 8000))
    debug_mode = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    app.run(debug=debug_mode, host='0.0.0.0', port=port) 
