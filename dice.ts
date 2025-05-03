class Dice {
  num: number;
  sides: number;
  modifier: number;

  constructor(num: number, sides: number, modifier: number) {
    this.num = num;
    this.sides = sides;
    this.modifier = modifier;
  }

  roll(): number {
    let total = 0;
    for (let i = 0; i < this.num; i++) {
      total += Math.floor(Math.random() * this.sides) + 1;
    }
    return total + this.modifier;
  }
}

export { Dice }; 