#주식 목록
#주식 매수
#주식 매도
#내 자산 보기
#종료

print("주식목록")

press = int(input("1.주식목록 2.주식거래 3.내 자산 보기 4.종료"))

if press == 1:
    stocks = [
        {"name":"삼성전자", "price":10000 },
        {"name":"현대자동차", "price":8000 },
        {"name":"네이버", "price":6000 },
        {"name":"CJ", "price":4000 }
    ]

    for i in stocks:
        print(i["name"],i["price"])

elif press == 2:
    print("1. 매도   2. 매수")
    if press == 1:
        print("1. 삼성전자 2. 현대자동차 3. 네이버 4. 키움 ")
        if press == 1:
            print()