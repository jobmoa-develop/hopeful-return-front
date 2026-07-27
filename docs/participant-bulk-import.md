# 참여자관리 — XLSX 일괄 등록 (FE)

참여자관리 페이지에서 정부식 참여자 엑셀(.xlsx)을 업로드해 참여자를 일괄 등록한다.
파싱은 백엔드(Apache POI)가 담당하므로 **FE 추가 라이브러리는 없다**.

## 진입점
- `ParticipantsPage` 상단 **"⬆ 일괄 등록"** 버튼 — `roleConfig.can.register === 1`(관리 5롤)일 때만 노출.
- 모달: `components/ParticipantModals.tsx` 의 `BulkImportModal`.

## 흐름 (4단계)
1. **파일 선택** — `.xlsx` 선택 후 "미리보기"(`previewBulkImport`, multipart 업로드).
2. **미리보기 + 과정명별 매핑/편집** — 교육과정명별 그룹(지역·회차번호·인원·오류수) 표에서
   그룹마다 등록할 **내부 회차**를 드롭다운(지역별 optgroup) 또는 "건너뛰기"로 지정.
   각 그룹의 **「▸ 확인·수정」** 을 펼치면 업로드된 행(이름·휴대폰·출생연도·신청일·선정일·상태)을
   **직접 확인·수정**할 수 있다. 필수값 오류 행은 빨간 배경으로 표시되며 수정하면 등록된다.
   (안내 문구: "회차를 선택하면 「▸ 확인·수정」을 눌러 업로드된 데이터를 확인하고 수정할 수 있습니다.")
3. **확정** — "N명 등록" 클릭 → `commitBulkImport(items)` (JSON). 편집된 행 + 각 행의 대상 회차를
   items 로 평탄화해 전송. 미매핑·중복·오류 행은 서버가 자동 스킵.
4. **결과 리포트** — 등록/신규·재사용/중복·미매핑·오류 건수와 스킵 사유 목록. 닫으면 목록 갱신.

## 상태·전화 매핑(참고)
- 상태 select: 접수(APPLIED)·선정(CONFIRMED)·취소(CANCELED). 엑셀 파싱 기본값은 선정→CONFIRMED, 미선정→CANCELED.
- 휴대폰은 서버가 재정규화(11/13자 하이픈/10자리 선행0누락 → 11자리).

## API (`api/courseParticipants.ts`)
- `previewBulkImport(file)` → `POST .../bulk-import/preview` (FormData `file`).
- `commitBulkImport(items)` → `POST .../bulk-import/commit` (JSON `{ items }`).

## 주의
- 한 파일에 여러 회차가 섞여 있어도 과정명별로 각각 매핑한다(멀티회차 지원).
- 내부 DB에 없는 회차(예: 인천)는 매핑할 대상이 없으므로 회차를 먼저 생성한 뒤 재업로드한다.
- 이메일·성별·수료 정보는 등록에 반영되지 않는다(참여자 스키마 미보유).
