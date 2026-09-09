#1. 플레이어 생성 
# 2. 초기 자금 100,000원 
# 3. 보유 주식 
# 4. 매수 
# ├─ 돈 충분한지 확인 
# └─ 주식 수 증가 
# 5. 매도 
# ├─ 주식 가지고 있는지 확인 
# └─ 주식 수 감소 
# 6. 현재 현금 
# 7. 현재 주식 평가금액 
# 8. 총 자산 
# 9. 수익률


import random

stocks = [
        {"name":"삼성전자", "price":10000 },
        {"name":"현대자동차", "price":8000 },
        {"name":"네이버", "price":6000 },
        {"name":"CJ", "price":4000 }
    ]
# for i in stocks:
#     print(i["name"],i["price"])

for i in stocks:
    x = random.random(0.0,0.1)
    print(i["name"],i["price"]*x)
