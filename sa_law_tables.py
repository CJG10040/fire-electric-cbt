"""Versioned official table images, embedded for single-file offline use.
The current reference table does not replace any historical answer.
"""
import base64
import hashlib
from pathlib import Path


def payload():
    raw = (Path(__file__).parent / 'sa_src/law_tables/height.gif').read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert raw[:6] in (b'GIF87a', b'GIF89a')
    assert digest == '843d5878e7a38367239021debec15c28d4e973064154cdd7989cc2eebc7821c2'
    return {'height': {
        'title': '표 2.4.1 부착 높이에 따른 감지기의 종류',
        'source': 't203', 'provision': '2.4.1 표 및 비고 1·2',
        'imageUrl': 'https://www.law.go.kr/LSW/flDownload.do?flSeq=161946117',
        'sha256': digest,
        'src': 'data:image/gif;base64,' + base64.b64encode(raw).decode('ascii'),
        'links': {
            'k2013_0_01': '읽을 곳: 15m 이상 20m 미만 행. 광전식의 형식·종별과 비고 1의 별도 형식승인 범위를 함께 확인하세요.',
            'k2013_0_20': '읽을 곳: 20m 이상 행과 비고 2. 광전식 분리형·공기흡입형 중 아날로그방식, 감광율 5%/m 미만 조건을 함께 확인하세요.',
            'k2019_0_24': '이 복합문항에서는 20m 이상 감지기 종류 부분에 해당하는 표입니다. 다른 소문항의 터널 간격·공기관 길이까지 이 표로 판단하지 마세요. 20m 이상 행과 비고 1·2를 확인하세요.'
        }
    }}
