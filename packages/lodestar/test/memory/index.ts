import {init, SecretKey, PointFormat, PublicKey, CoordType} from "@chainsafe/bls";

async function f() {
  await init("blst-native");

  const refs: any[] = [];
  const xs: number[] = [];
  const arrayBuffersArr: number[] = [];
  const externalArr: number[] = [];
  const heapTotal: number[] = [];
  const heapUsed: number[] = [];
  const rss: number[] = [];

  enum TestType {
    ArrayOfNumbers,
    BufferAlloc,
    BufferFromString,
    Number,
    PublicKey,
  }

  const testType = TestType.PublicKey;

  const pkComp = "b16a9d24e52360c6c6b335494a4973358a361757575b21c563b1727bf043675bb6e6659bbbed505fbbea0041dc83185d";

  for (let i = 0; i < 1e8; i++) {
    let value: any;

    switch (testType as TestType) {
      case TestType.ArrayOfNumbers:
        value = [1, 2, 3, 4];
        break;
      case TestType.BufferAlloc:
        value = Buffer.alloc(32, i);
        break;
      case TestType.BufferFromString:
        value = Buffer.from(String(i).padStart(64, "0"), "hex");
        break;
      case TestType.Number:
        value = i;
        break;
      case TestType.PublicKey:
        value = PublicKey.fromBytes(Buffer.from(pkComp, "hex"), CoordType.jacobian);
    }

    // console.log(Buffer.from(value).toString("hex"));

    refs.push(value);

    // With Buffer of 32 bytes
    // - arrayBuffers - 32 bytes / item
    // - external - 32 bytes / item
    // - heapTotal - 170 bytes / item

    if (i % 1000 === 0) {
      // global.gc();
      xs.push(i);
      const memoryUsage = process.memoryUsage();
      arrayBuffersArr.push(memoryUsage.arrayBuffers);
      externalArr.push(memoryUsage.external);
      heapTotal.push(memoryUsage.heapTotal);
      heapUsed.push(memoryUsage.heapUsed);
      rss.push(memoryUsage.rss);

      const arrayBuffersM = linearRegression(xs, arrayBuffersArr).m;
      const externalM = linearRegression(xs, externalArr).m;
      const heapTotalM = linearRegression(xs, heapTotal).m;
      const heapUsedM = linearRegression(xs, heapUsed).m;
      const rssM = linearRegression(xs, rss).m;

      console.log(i, {arrayBuffersM, externalM, heapTotalM, heapUsedM, rssM});
    }
  }
}

f();

/**
 * From https://github.com/simple-statistics/simple-statistics/blob/d0d177baf74976a2421638bce98ab028c5afb537/src/linear_regression.js
 *
 * [Simple linear regression](http://en.wikipedia.org/wiki/Simple_linear_regression)
 * is a simple way to find a fitted line between a set of coordinates.
 * This algorithm finds the slope and y-intercept of a regression line
 * using the least sum of squares.
 *
 * @param data an array of two-element of arrays,
 * like `[[0, 1], [2, 3]]`
 * @returns object containing slope and intersect of regression line
 * @example
 * linearRegression([[0, 0], [1, 1]]); // => { m: 1, b: 0 }
 */
export function linearRegression(xs: number[], ys: number[]): {m: number; b: number} {
  let m: number, b: number;

  // Store data length in a local variable to reduce
  // repeated object property lookups
  const dataLength = xs.length;

  //if there's only one point, arbitrarily choose a slope of 0
  //and a y-intercept of whatever the y of the initial point is
  if (dataLength === 1) {
    m = 0;
    b = ys[0];
  } else {
    // Initialize our sums and scope the `m` and `b`
    // variables that define the line.
    let sumX = 0,
      sumY = 0,
      sumXX = 0,
      sumXY = 0;

    // Use local variables to grab point values
    // with minimal object property lookups
    let x: number, y: number;

    // Gather the sum of all x values, the sum of all
    // y values, and the sum of x^2 and (x*y) for each
    // value.
    //
    // In math notation, these would be SS_x, SS_y, SS_xx, and SS_xy
    for (let i = 0; i < dataLength; i++) {
      x = xs[i];
      y = ys[i];

      sumX += x;
      sumY += y;

      sumXX += x * x;
      sumXY += x * y;
    }

    // `m` is the slope of the regression line
    m = (dataLength * sumXY - sumX * sumY) / (dataLength * sumXX - sumX * sumX);

    // `b` is the y-intercept of the line.
    b = sumY / dataLength - (m * sumX) / dataLength;
  }

  // Return both values as an object.
  return {
    m: m,
    b: b,
  };
}
