from stock_market import InvestmentGame, input_number


class StockGame:
    def __init__(self):
        self.records = []

    def start_game(self):
        print("\n" + "=" * 50)
        print("                    모의 투자 게임 시작")
        print("=" * 50)

        player_name = input("플레이어 이름을 입력하세요: ").strip()
        if player_name == "":
            player_name = "이름없음"

        game = InvestmentGame(player_name)

        for hour in range(1, 11):
            game.start_hour(hour)

        result = game.finish()
        self.records.append(result)

    def show_ranking(self):
        if len(self.records) == 0:
            print("아직 게임 기록이 없습니다.")
            return

        print("\n" + "=" * 50)
        print("                    수익률 랭킹")
        print("=" * 50)

        ranking = sorted(
            self.records,
            key=lambda record: record["rate"],
            reverse=True,
        )

        for rank, record in enumerate(ranking, start=1):
            name = record["name"]
            rate = record["rate"]
            assets = record["assets"]
            print(f"{rank}등 {name}: {rate:+.2f}% ({assets:,}원)")

    def run(self):
        while True:
            print("\n" + "=" * 50)
            print("                    모의 투자 게임")
            print("=" * 50)
            print("1. 게임 시작")
            print("2. 수익률 랭킹")
            print("3. 게임 종료")

            choice = input_number("메뉴를 선택하세요: ", 1, 3)

            if choice == 1:
                self.start_game()
            elif choice == 2:
                self.show_ranking()
            else:
                print("게임을 종료합니다.")
                break


# if __name__ == "__main__":
StockGame().run()
