export const getBox = (x: number, y: number) => {
  return Math.floor(x / 3) * 3 + Math.floor(y / 3);
};

let currentPuzzle = `---------
---------
---------
---------
---------
---------
---------
---------
---------`
  .split("\n")
  .map((r) => r.split(""));

const getCell = (x: number, y: number) => {
  return currentPuzzle[x][y];
};

const getSolutionCell = (x: number, y: number) => {
  return currentSolution[x][y];
};

const setSolutionCell = (x: number, y: number, c: string) => {
  currentSolution[x][y] = c;
};

const setCell = (x: number, y: number, c: string, puzzle = currentPuzzle) => {
  puzzle[x][y] = c;
};

export const setCellManual = (
  x: number,
  y: number,
  c: string,
  puzzle = currentPuzzle,
  solution = currentSolution,
  onFail = () => {}
) => {
  if (puzzle[x][y] !== "-") {
    return null;
  }

  if (solution[x][y] === c) {
    puzzle[x][y] = c;
    return puzzle;
  }

  onFail();
  return null;
};

const puzzles = [
  // easy
  `762--9-1-
3-4-----2
8---564-7
-971-----
--6--87-3
58--6-2-1
-7-9--3--
9-142--86
245--3---`,
  `247-91-68
1-576-3--
86-4----7
9--2-6---
---94768-
6-4-5--19
7---3-92-
4-96-----
------4-3`,
  // medium
  `---4---67
461-78-32
2-8653-19
-96-3-2--
8-7---34-
---5---8-
-842-5---
----89-2-
9-----6--`,
  `3--4---8-
95---6437
67-5---1-
--7-31-65
--56-8--3
8-----7-1
--13-4---
4----2158
5--819--4`,
  // hard
  `--931-52-
5317-6---
-274-----
4---7-3-2
---8----6
-----347-
----5----
-----7-49
-74---6-1`,
  `4--6--5--
3--5-9-2-
7-283---9
--8--7---
-4-396--8
6--2-4---
-7----9--
-2-7--1--
1-5---3--`,
  // expert
  `---458629
---6-----
6-92-----
---84-7-1
57----84-
-4--27---
-9-7-4-36
2---6-4-5
-6----1--`,
  `--6-----2
75---4--6
---3-64--
8--5-916-
-31---8-4
-49--1--7
9--4--7-8
----6-2--
-----8-5-`,
  // master
  `17-4-5--9
----2-4--
--5-6----
----5----
--73-16--
-9-----8-
---2-----
3-------6
--17-43--`,
  `--8--4--2
-5---1---
7--25--3-
4-----6--
-6-53---8
----1----
--9----7-
-4-86---3
-----2---`,
  // extreme
  `-6-----7-
-1--26---
--4---25-
9---5---3
----8-9--
-8----4-7
--64-----
-4------8
-9--38---`,
  `---42---6
--79-5-2-
------1--
4---71---
2--3-----
98--5----
-----4-9-
----3--5-
--2---74-`,
];

const solutions = [
  `762349815
354871962
819256437
497132658
126598743
583764291
678915324
931427586
245683179`,
  `247391568
195768342
863425197
958216734
312947685
674853219
781534926
439672851
526189473`,
  `359412867
461978532
278653419
596834271
827196345
143527986
784265193
615389724
932741658`,
  `312497586
958126437
674583912
247931865
195678243
863245791
781354629
439762158
526819374`,
  `649318527
531726894
827495163
496571382
753842916
218963475
962154738
185637249
374289651`,
  `489672531
316549827
752831649
238157496
547396218
691284753
873415962
924763185
165928374`,
  `317458629
452619387
689273514
923845761
571396842
846127953
195784236
238961475
764532198`,
  `496157382
753284916
218396475
827549163
531672894
649831527
962415738
185763249
374928651`,
  `176485239
938127465
245963817
612859743
857341692
493672581
789236154
324518976
561794328`,
  `398674152
254381769
716259834
473928615
961537248
582416397
829143576
147865923
635792481`,
  `269345871
518726349
734891256
971254683
423687915
685913427
856479132
347162598
192538764`,
  `193427586
867915324
524683179
435871962
276349815
981256437
358764291
749132658
612598743`,
];

const puzzleIndex = 11;

let currentSolution = solutions[puzzleIndex]
  .split("\n")
  .map((r) => r.split(""));

const getRowCells = (y: number) => {
  return [
    [0, y],
    [1, y],
    [2, y],
    [3, y],
    [4, y],
    [5, y],
    [6, y],
    [7, y],
    [8, y],
  ];
};

const getColCells = (x: number) => {
  return [
    [x, 0],
    [x, 1],
    [x, 2],
    [x, 3],
    [x, 4],
    [x, 5],
    [x, 6],
    [x, 7],
    [x, 8],
  ];
};

const getBoxCells = (box: number) => {
  const boxes: number[][] = [];
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 9; y++) {
      if (getBox(x, y) === box) {
        boxes.push([x, y]);
      }
    }
  }
  return boxes;
};

const shuffleArray = (array: number[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
};

const swapCells = (cellsA: number[][], cellsB: number[][]) => {
  const cellsANumbers = cellsA.map(([x, y]) => {
    return getCell(x, y);
  });
  const cellsBNumbers = cellsB.map(([x, y]) => {
    return getCell(x, y);
  });
  cellsA.forEach(([x, y], index) => {
    setCell(x, y, cellsBNumbers[index]);
  });
  cellsB.forEach(([x, y], index) => {
    setCell(x, y, cellsANumbers[index]);
  });
  // swap solution cells
  const solutionCellsANumbers = cellsA.map(([x, y]) => {
    return getSolutionCell(x, y);
  });
  const solutionCellsBNumbers = cellsB.map(([x, y]) => {
    return getSolutionCell(x, y);
  });
  cellsA.forEach(([x, y], index) => {
    setSolutionCell(x, y, solutionCellsBNumbers[index]);
  });
  cellsB.forEach(([x, y], index) => {
    setSolutionCell(x, y, solutionCellsANumbers[index]);
  });
};

const randomizeBoard = () => {
  // do 32 shuffles
  for (let r = 0; r < 64; r++) {
    const operation = Math.floor(Math.random() * 6);
    // 0. swap two rows (within the same 3x3 group)
    if (operation === 0) {
      const randomRowGroup = Math.floor(Math.random() * 3) * 3;
      const randomRow1 = Math.floor(Math.random() * 3);
      const randomRow2 = (1 + randomRow1) % 3;
      swapCells(
        getRowCells(randomRowGroup + randomRow1),
        getRowCells(randomRowGroup + randomRow2)
      );
    }
    // 1. swap two columns (within the same 3x3 group)
    if (operation === 1) {
      const randomColGroup = Math.floor(Math.random() * 3) * 3;
      const randomCol1 = Math.floor(Math.random() * 3);
      const randomCol2 = (1 + randomCol1) % 3;
      swapCells(
        getColCells(randomColGroup + randomCol1),
        getColCells(randomColGroup + randomCol2)
      );
    }
    // 2. swap two 3x3 group rows
    if (operation === 2) {
      const randomRow1 = Math.floor(Math.random() * 3) * 3;
      const randomRow2 = ((randomRow1 / 3 + 1) % 3) * 3;
      swapCells(
        [
          ...getBoxCells(randomRow1),
          ...getBoxCells(randomRow1 + 1),
          ...getBoxCells(randomRow1 + 2),
        ],
        [
          ...getBoxCells(randomRow2),
          ...getBoxCells(randomRow2 + 1),
          ...getBoxCells(randomRow2 + 2),
        ]
      );
    }
    // 3. swap two 3x3 group columns
    if (operation === 3) {
      const randomCol1 = Math.floor(Math.random() * 3);
      const randomCol2 = (randomCol1 + 1) % 3;
      swapCells(
        [
          ...getBoxCells(randomCol1),
          ...getBoxCells(randomCol1 + 3),
          ...getBoxCells(randomCol1 + 6),
        ],
        [
          ...getBoxCells(randomCol2),
          ...getBoxCells(randomCol2 + 3),
          ...getBoxCells(randomCol2 + 6),
        ]
      );
    }
    // 4. transpose (x,y -> y,x)
    if (operation === 4) {
      swapCells(
        Array(81)
          .fill(true)
          .map((v, i) => [Math.floor(i / 9) % 9, i % 9]),
        Array(81)
          .fill(true)
          .map((v, i) => [i % 9, Math.floor(i / 9) % 9])
      );
    }
    // 5. swap numbers
    if (operation === 5) {
      const remap = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
          const solutionCell = getSolutionCell(x, y);
          const cell = getCell(x, y);
          const newCellNumber =
            cell === "-" ? "-" : String(remap[Number(cell) - 1]);
          const newSolutionNumber = String(remap[Number(solutionCell) - 1]);
          setCell(x, y, newCellNumber);
          setSolutionCell(x, y, newSolutionNumber);
        }
      }
    }
  }
};

const getStartingTiles = () => {
  const board: boolean[][] = [];
  for (let x = 0; x < 9; x++) {
    board.push([]);
    for (let y = 0; y < 9; y++) {
      board[x][y] = currentPuzzle[x][y] !== "-";
    }
  }
  return board;
};

export const getStartingPuzzleNotes = () => {
  const board: string[][][] = [];
  for (let x = 0; x < 9; x++) {
    board.push([]);
    for (let y = 0; y < 9; y++) {
      board[x][y] = [];
    }
  }
  return board;
};

export type Puzzle = {
  puzzleIndex: number;
  currentPuzzle: string[][];
  currentSolution: string[][];
  startingTiles: boolean[][];
  puzzleNotes: string[][][];
};

export const getNewPuzzle = (): Puzzle => {
  const pIndex = Math.floor(Math.random() * 12);
  currentPuzzle = puzzles[pIndex].split("\n").map((r) => r.split(""));
  currentSolution = solutions[pIndex].split("\n").map((r) => r.split(""));
  randomizeBoard();
  const startingTiles = getStartingTiles();
  const puzzleNotes = getStartingPuzzleNotes();

  return {
    puzzleIndex: pIndex,
    currentPuzzle,
    startingTiles,
    currentSolution,
    puzzleNotes,
  };
};
