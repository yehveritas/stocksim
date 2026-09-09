INITIAL_CASH = 100_000

STOCKS = [
    {"name": "삼성전자", "price": 10_000},
    {"name": "현대자동차", "price": 8_000},
    {"name": "네이버", "price": 6_000},
    {"name": "하이브", "price": 5_000},
]

NEWS = {
    1: {
        "text": "밤사이 해외 시장에서 기술주 중심의 투자 심리가 크게 개선됐습니다.",
        "changes": {"삼성전자": 30, "현대자동차": -8, "네이버": -10, "하이브": -5},
    },
    2: {
        "text": "글로벌 제조업체들의 신규 주문이 예상치를 크게 웃돌았다는 소식입니다.",
        "changes": {"삼성전자": -10, "현대자동차": 35, "네이버": 5, "하이브": -8},
    },
    3: {
        "text": "친환경 산업에 대한 정부의 지원 확대 가능성이 높아지고 있습니다.",
        "changes": {"삼성전자": 8, "현대자동차": -12, "네이버": 40, "하이브": 5},
    },
    4: {
        "text": "국내 한 플랫폼에서 공개한 새로운 서비스가 이용자들 사이에서 빠르게 확산되고 있습니다.",
        "changes": {"삼성전자": 20, "현대자동차": 15, "네이버": -15, "하이브": -10},
    },
    5: {
        "text": "원화 약세가 이어지면서 수출 기업들의 실적 전망이 엇갈리고 있습니다.",
        "changes": {"삼성전자": -8, "현대자동차": -5, "네이버": 10, "하이브": 50},
    },
    6: {
        "text": "해외에서 국내 아티스트들의 공연과 콘텐츠에 대한 관심이 크게 증가하고 있습니다.",
        "changes": {"삼성전자": 5, "현대자동차": 8, "네이버": -40, "하이브": -25},
    },
    7: {
        "text": "최근 급등한 일부 성장주에 대한 과열 논란이 커지고 있습니다.",
        "changes": {"삼성전자": -25, "현대자동차": -35, "네이버": 10, "하이브": 5},
    },
    8: {
        "text": "국제 원자재 가격이 급등하면서 제조업계의 비용 부담이 커지고 있습니다.",
        "changes": {"삼성전자": 10, "현대자동차": 15, "네이버": -10, "하이브": -100},
    },
    9: {
        "text": "한 기업에서 누적된 경영 문제가 예상보다 심각한 수준이라는 소식이 전해졌습니다.",
        "changes": {"삼성전자": 30, "현대자동차": -10, "네이버": 40, "하이브": 50},
    },
    10: {
        "text": "오전의 불안감이 잦아들면서 시장 전반에 저가 매수세가 유입되고 있습니다.",
        "changes": {},
    },
}


def input_number(prompt, minimum, maximum):
    while True:
        try:
            number = int(input(prompt))
            if minimum <= number <= maximum:
                return number
            print(f"{minimum}~{maximum} 사이의 숫자를 입력해주세요.")
        except ValueError:
            print("숫자만 입력해주세요.")


class StockMarket:
    def __init__(self):
        self.prices = {stock["name"]: stock["price"] for stock in STOCKS}

    def show_prices(self):
        print("\n[현재 주가]")
        for number, (name, price) in enumerate(self.prices.items(), start=1):
            price_text = "상장폐지" if price == 0 else f"{price:,}원"
            print(f"{number}. {name}: {price_text}")

    def announce_news(self, hour):
        news = NEWS[hour]
        changes = news["changes"]
        print("\n" + "=" * 50)
        print(f"[{hour}시 공개 뉴스] 다음 시간 주가에 반영됩니다.")
        print(f"뉴스: {news['text']}")
        if changes:
            print("예상 변동:")
            for name, change in changes.items():
                print(f"  - {name}: {change:+d}%")
        else:
            print("예상 변동: 없음")
        print("=" * 50)

    def apply_news(self, hour):
        for name, change in NEWS[hour]["changes"].items():
            if self.prices[name] == 0:
                continue
            self.prices[name] = int(self.prices[name] * (100 + change) / 100)


class InvestmentGame:
    def __init__(self, player_name):
        self.player_name = player_name
        self.market = StockMarket()
        self.cash = INITIAL_CASH
        self.holdings = {stock["name"]: 0 for stock in STOCKS}

    def get_stock_value(self):
        stock_value = 0
        for name, quantity in self.holdings.items():
            stock_value += self.market.prices[name] * quantity
        return stock_value

    def show_assets(self):
        stock_value = self.get_stock_value()
        total = self.cash + stock_value

        print("\n[내 자산]")
        print(f"현금   : {self.cash:>10,}원")
        print(f"주식   : {stock_value:>10,}원")
        print(f"총자산 : {total:>10,}원")
        print("보유 주식:")

        for name, quantity in self.holdings.items():
            if quantity > 0:
                print(f"  - {name}: {quantity}주")

        if not any(self.holdings.values()):
            print("  - 없음")

    def select_stock(self):
        names = list(self.market.prices)
        choice = input_number("종목 번호를 선택하세요: ", 1, len(names))
        return names[choice - 1]

    def buy(self):
        print("\n[매수]")
        name = self.select_stock()
        price = self.market.prices[name]

        if price == 0:
            print("상장폐지된 종목은 매수할 수 없습니다.")
            return

        maximum = self.cash // price
        if maximum == 0:
            print("매수할 현금이 부족합니다.")
            return

        quantity = input_number(f"매수 수량(1~{maximum}): ", 1, maximum)
        self.cash -= price * quantity
        self.holdings[name] += quantity
        print(f"{name} {quantity}주를 매수했습니다.")

    def sell(self):
        print("\n[매도]")
        name = self.select_stock()
        owned = self.holdings[name]

        if owned == 0:
            print("보유한 주식이 없습니다.")
            return

        if self.market.prices[name] == 0:
            print("상장폐지된 주식은 매도할 수 없습니다.")
            return

        quantity = input_number(f"매도 수량(1~{owned}): ", 1, owned)
        self.cash += self.market.prices[name] * quantity
        self.holdings[name] -= quantity
        print(f"{name} {quantity}주를 매도했습니다.")

    def trade(self, hour):
        print("\n" + "#" * 50)
        print(f"                         {hour}시 거래")
        print("#" * 50)

        while True:
            self.market.show_prices()
            self.show_assets()
            print("\n[거래 메뉴]")
            print("1. 매수")
            print("2. 매도")
            print("3. 관망하고 다음 시간으로")

            choice = input_number("행동을 선택하세요: ", 1, 3)
            if choice == 1:
                self.buy()
            elif choice == 2:
                self.sell()
            else:
                print(f"{hour}시 거래를 마칩니다.")
                return

    def start_hour(self, hour):
        if hour > 1:
            self.market.apply_news(hour - 1)
            print(f"\n{hour}시가 되었습니다. {hour - 1}시 뉴스가 반영됩니다.")

        self.market.announce_news(hour)

        if hour < 10:
            self.trade(hour)
        else:
            print("\n10시 시장이 마감되었습니다.")

    def finish(self):
        stock_value = self.get_stock_value()
        final_assets = self.cash + stock_value
        rate = (final_assets - INITIAL_CASH) / INITIAL_CASH * 100

        print("\n" + "=" * 50)
        print("                         최종 결과")
        print("=" * 50)
        self.market.show_prices()
        self.show_assets()
        print(f"\n{self.player_name}님의 최종 수익률: {rate:+.2f}%")

        return {"name": self.player_name, "assets": final_assets, "rate": rate}





