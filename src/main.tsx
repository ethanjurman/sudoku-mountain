// Learn more at developers.reddit.com/docs
import {
  Context,
  Devvit,
  RedisClient,
  TriggerContext,
  useAsync,
  useChannel,
  UseChannelResult,
  useForm,
  useInterval,
  useState,
} from "@devvit/public-api";
import {
  getBox,
  getNewPuzzle,
  getStartingPuzzleNotes,
  setCellManual,
} from "./sudoku-gen.js";
import { HEIGHTS } from "./famousHeights.js";
// REDIS KEYS
const REDIS_LATEST_PUZZLE_KEY = "puzzlePostId";
const REDIS_HEIGHT_KEY = "height";

function mergeStrings(str1: string, str2: string): string {
  if (str1.length > str2.length) {
    return str1;
  }
  if (str2.length > str1.length) {
    return str2;
  }
  let result = "";
  for (let i = 0; i < str1.length; i++) {
    // If the character in str1 is not a dash, use it; otherwise check str2.
    const char1 = str1[i] === "-" ? null : str1[i];
    const char2 = str2[i] === "-" ? null : str2[i];
    result += char1 || char2 || "-";
  }
  return result;
}

function checkBoardSolutionState(
  boardPuzzle: string,
  solutionPuzzle: string
): string | null {
  if (
    boardPuzzle.length > solutionPuzzle.length ||
    solutionPuzzle.length > boardPuzzle.length
  ) {
    console.log("early return");
    return null;
  }
  let result = "";
  for (let i = 0; i < solutionPuzzle.length; i++) {
    // if character is not the solution item AND isn't '-' then something went wrong and we should replace it with the solution item
    if (boardPuzzle[i] === "-") {
      result += "-";
    }
    if (boardPuzzle[i] !== "-" && boardPuzzle[i] !== solutionPuzzle[i]) {
      result += solutionPuzzle;
    }
  }
  console.log("result", result);
  return result;
}

function stringToBoard(str: string): string[][] {
  return str.split("").reduce<string[][]>((acc, c, index) => {
    if (index % 9 === 0) {
      acc.push([]);
    }
    acc[Math.floor(index / 9)].push(c);
    return acc;
  }, []);
}

function boardToString(board: string[][]) {
  return board?.map((r) => r?.join(""))?.join("") || "";
}

Devvit.configure({
  redditAPI: true,
  redis: true,
  realtime: true,
});

// heal all players one heart
Devvit.addSchedulerJob({
  name: "hourly_job",
  onRun: async (_, context) => {
    // Your hourly task code goes here
    console.log("Hourly job running at:", new Date());
    const healths = await context.redis.zRange("health", 0, -1);
    for (let i = 0; i < healths.length; i++) {
      await context.redis.zIncrBy("health", healths[i].member, 1);
    }
  },
});

async function runHourlyJob(context: TriggerContext) {
  try {
    // Schedule job to run every hour (at minute 0)
    const jobs = await context.scheduler.listJobs();
    for (let i = 0; i < jobs.length; i++) {
      await context.scheduler.cancelJob(jobs[i].id);
    }
    const jobId = await context.scheduler.runJob({
      cron: "0 * * * *", // Run at minute 0 of every hour
      name: "hourly_job",
    });

    // Store the job ID in Redis so you can reference it later if needed
    await context.redis.set("hourly_job_id", jobId);
  } catch (e) {
    console.log("Error scheduling hourly job:", e);
    throw e;
  }
}

async function getUsernameFromId(userId: string, context: Context) {
  try {
    const user = await context.reddit.getUserById(userId);
    return user?.username;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

// Handle initial installation
Devvit.addTrigger({
  event: "AppInstall",
  onEvent: async (__event, context) => {
    runHourlyJob(context);
  },
});

// Handle app updates
Devvit.addTrigger({
  event: "AppUpgrade",
  onEvent: async (__event, context) => {
    // Code to run when app is updated to a new version
    runHourlyJob(context);
  },
});

function sessionId(): string {
  let id = "";
  const asciiZero = "0".charCodeAt(0);
  for (let i = 0; i < 4; i++) {
    id += String.fromCharCode(Math.floor(Math.random() * 26) + asciiZero);
  }
  return id;
}

const getIsPuzzleComplete = (puzzleState: string) => {
  return !puzzleState.includes("-");
};

const getUpdatePuzzleNotes = (
  puzzleNotes: string[][][],
  cellX: number,
  cellY: number,
  c: string
) => {
  const updatedPuzzleNotes = JSON.parse(
    JSON.stringify(puzzleNotes)
  ) as string[][][];
  const targetBox = getBox(cellX, cellY);
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 9; y++) {
      if (cellX === x && puzzleNotes[x][y].includes(c)) {
        updatedPuzzleNotes[x][y] = updatedPuzzleNotes[x][y].filter(
          (i) => i !== c
        );
      }
      if (cellY === y && puzzleNotes[x][y].includes(c)) {
        updatedPuzzleNotes[x][y] = updatedPuzzleNotes[x][y].filter(
          (i) => i !== c
        );
      }
      if (targetBox === getBox(x, y) && puzzleNotes[x][y].includes(c)) {
        updatedPuzzleNotes[x][y] = updatedPuzzleNotes[x][y].filter(
          (i) => i !== c
        );
      }
    }
  }
  return updatedPuzzleNotes;
};

Devvit.addMenuItem({
  label: "Clear scores",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    await context.redis.zRemRangeByRank("health", 0, -1);
  },
});

Devvit.addMenuItem({
  label: "Clear health wait",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    await context.redis.zRemRangeByRank("health", 0, -1);
  },
});

Devvit.addMenuItem({
  label: "Manually trigger hourly auto-heal",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    runHourlyJob(context);
  },
});

// Add a menu item to the subreddit menu for instantiating the new experience post
Devvit.addMenuItem({
  label: "Manually Add Board",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { reddit, redis, ui } = context;
    ui.showToast(
      "Submitting your post - upon completion you'll navigate there."
    );

    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitPost({
      title: "0 meters",
      subredditName: subreddit.name,
      // The preview appears while the post loads
      preview: (
        <vstack height="100%" width="100%" alignment="middle center">
          <text size="large">Climbing Mountain ...</text>
        </vstack>
      ),
    });
    ui.navigateTo(post.url);
    redis.set(REDIS_LATEST_PUZZLE_KEY, post.url || "");
    post.sticky(1);
  },
});

Devvit.addMenuItem({
  label: "Skip puzzle",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { redis } = context;

    const posts = await context.reddit
      .getHotPosts({
        subredditName: context.subredditName,
        limit: 10, // Adjust as needed
      })
      .all();

    // Filter for stickied posts
    const post = posts.filter((post) => post.stickied)[0];

    const solution = await redis.get(`${post.id}:solution`);
    if (solution) {
      await redis.set(`${post.id}:puzzle`, solution);
    }

    makeNewBoard(context, null, redis, post.id);
  },
});

Devvit.addMenuItem({
  label: "Scramble puzzle (for testing)",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { redis } = context;

    const posts = await context.reddit
      .getHotPosts({
        subredditName: context.subredditName,
        limit: 10, // Adjust as needed
      })
      .all();

    // Filter for stickied posts
    const post = posts.filter((post) => post.stickied)[0];

    await redis.set(
      `${post.id}:puzzle`,
      [...Array(9)]
        .fill(String(Math.floor(Math.random() * 1000000000)))
        .join("")
        .replace(/0/g, "-")
        .replace(/1/g, "-")
        .replace(/2/g, "-")
        .replace(/3/g, "-")
        .replace(/5/g, "-")
        .replace(/7/g, "-")
        .replace(/9/g, "-")
    );
  },
});

Devvit.addMenuItem({
  label: "Set to top height",
  location: "post",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { redis, ui } = context;
    ui.showToast("Setting as main puzzle");
    const post = context.postId
      ? await context.reddit.getPostById(context.postId)
      : undefined;
    redis.set(REDIS_LATEST_PUZZLE_KEY, post?.url || "");
    post?.sticky(1);
  },
});

Devvit.addMenuItem({
  label: "Delete board data",
  location: "post",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { redis, ui } = context;
    ui.showToast("clearing redis data");
    redis.del(`${context.postId}:state`);
    redis.del(`${context.postId}:notes`);
    redis.set("height", "0");
  },
});

Devvit.addMenuItem({
  label: "Delete boards",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const posts = await context.reddit
      .getTopPosts({
        subredditName: context.subredditName,
        timeframe: "all",
      })
      .all();

    posts.forEach((post) => {
      if (post.authorName === "sudoku-mountain") {
        post.delete();
      }
      context.redis.del(`${post.id}:puzzle`);
      context.redis.del(`${post.id}:solution`);
      context.redis.del(`${post.id}:state`);
      context.redis.del(`${post.id}:notes`);
    });
  },
});

const makeNewBoard = async (
  context: Context,
  channel: UseChannelResult | null,
  redis: RedisClient,
  postId: string
) => {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const height = await redis.get(REDIS_HEIGHT_KEY);
  const latestPuzzle = await redis.get(REDIS_LATEST_PUZZLE_KEY);
  const post = postId ? await context.reddit.getPostById(postId) : undefined;
  if (latestPuzzle && latestPuzzle !== post?.url && channel) {
    // there exists a newer puzzler, send user to that
    channel.send({
      name: "new_board_link",
      value: latestPuzzle,
    });
  }
  // if this is the latest puzzle, we need to make a new board
  if (subreddit && latestPuzzle === post?.url) {
    const newHeight = (Number(height) || 0) + 5;
    redis.set(REDIS_HEIGHT_KEY, String(newHeight));
    const titleAdd = HEIGHTS[newHeight];
    const post = await context.reddit.submitPost({
      title: `${newHeight} meters${titleAdd ? ` - ${titleAdd}` : ""}`,
      subredditName: subreddit.name,
      preview: <text>Climbing Mountain ...</text>,
    });
    redis.set(REDIS_LATEST_PUZZLE_KEY, post.url);
    redis.del(`${postId}:state`);
    redis.del(`${postId}:notes`);

    if (channel) {
      channel.send({
        name: "new_board_link",
        value: post.url,
      });
    }
    post.sticky(1);
  }
};

// Add a post type definition
Devvit.addCustomPostType({
  name: "Sudoku Board",
  height: "tall",
  render: (context) => {
    const { ui, redis, userId, postId } = context;
    const screenWidth = context.uiEnvironment?.dimensions?.width || 36 * 12;
    const screenHeight = context.uiEnvironment?.dimensions?.height || 36 * 12;
    const [lastMistake, setLastMistake] = useState("");
    const [size, setSize] = useState(
      Math.floor(Math.min(screenHeight, screenWidth) / 12)
    );

    const mySession = sessionId();

    // LATEST PUZZLE ID START
    const [isLoadingLatestPuzzleId, setIsLoadingLatestPuzzleId] =
      useState(false);
    const [isLatestBoard, setIsLatestBoard] = useState<boolean | null>(null);
    // LATEST PUZZLE ID END

    // HEALTH LOGIC START
    const [isLoadingHealth, setIsLoadingHealth] = useState(false);
    const [health, setHealth] = useState<number>(3);

    useInterval(async () => {
      // check if board is good
      if (isLatestBoard === null) {
        const latestPuzzle = await redis.get(REDIS_LATEST_PUZZLE_KEY);
        const post = context.postId
          ? await context.reddit.getPostById(context.postId)
          : undefined;
        if (latestPuzzle && latestPuzzle !== post?.url) {
          setIsLatestBoard(false);
        } else {
          setIsLatestBoard(true);
        }
      }
      // update board if didn't fetch latest
      const boardPuzzleRedisResult = await redis.get(`${postId}:puzzle`);
      const puzzleString = boardToString(boardPuzzle);
      if (boardPuzzleRedisResult && puzzleString !== boardPuzzleRedisResult) {
        const mergedResult = mergeStrings(puzzleString, boardPuzzleRedisResult);
        setBoardPuzzle(stringToBoard(mergedResult));
      }
    }, 2000);

    const updateHealth = (newHp: number) => {
      if (userId) {
        redis.zAdd("health", { member: userId, score: newHp });
      }
      setHealth(Number(newHp));
      channel.send({
        name: "health_set",
        value: String(newHp),
        session: mySession,
        postId,
        userId,
      });
    };
    const decreaseHealth = () => {
      updateHealth(health - 1);
    };
    // HEALTH LOGIC END

    // SCORE LOGIC START
    const [isLoadingScore, setIsLoadingScore] = useState(false);
    const [score, setScore] = useState<number>(0);

    const updateScore = (newScore: number) => {
      if (userId) {
        redis.zAdd("score", { member: userId, score: newScore });
      }
      setScore(newScore);
      channel.send({
        name: "score_set",
        value: String(newScore),
        session: mySession,
        postId,
        userId,
      });
    };
    // SCORE LOGIC END

    // BOARD PUZZLE LOGIC START
    const [isLoadingBoardPuzzle, setIsLoadingBoardPuzzle] = useState(false);
    const [boardPuzzle, setBoardPuzzle] = useState<string[][]>([]);

    const redisBoardPuzzleKey = `${postId}:puzzle`;

    const updateBoardPuzzle = (newBoardPuzzle: string[][]) => {
      const puzzleString = boardToString(boardPuzzle);
      const newPuzzleString = boardToString(newBoardPuzzle);
      const mergedPuzzleString = mergeStrings(puzzleString, newPuzzleString);
      const mergedBoard = stringToBoard(mergedPuzzleString);

      redis.set(redisBoardPuzzleKey, mergedPuzzleString);
      // confirmed okay
      setBoardPuzzle(mergedBoard);
      channel.send({
        name: "puzzle_set",
        value: JSON.stringify(mergedBoard),
        session: mySession,
        postId: postId,
      });
      if (getIsPuzzleComplete(mergedPuzzleString)) {
        makeNewBoard(context, channel, redis, context.postId!);
      }
    };
    // BOARD PUZZLE LOGIC END

    // BOARD SOLUTION LOGIC START
    const [isLoadingBoardSolution, setIsLoadingBoardSolution] = useState(false);
    const [boardSolution, setBoardSolution] = useState<string[][]>([]);

    const redisBoardSolutionKey = `${postId}:solution`;

    const updateBoardSolution = (newBoardSolution: string[][]) => {
      redis.set(redisBoardSolutionKey, `${boardToString(newBoardSolution)}`);
      setBoardSolution(newBoardSolution);
      channel.send({
        name: "solution_set",
        value: JSON.stringify(newBoardSolution),
        session: mySession,
        postId: postId,
      });
    };
    // BOARD SOLUTION LOGIC END

    // BOARD STATE LOGIC START
    const [isLoadingBoardState, setIsLoadingBoardState] = useState(false);
    const [boardState, setBoardState] = useState<string[][]>([]);

    const redisBoardStateKey = `${postId}:state`;

    const updateBoardState = (newBoardState: string[][]) => {
      redis.set(redisBoardStateKey, `${boardToString(newBoardState)}`);
      setBoardState(newBoardState);
      channel.send({
        name: "state_set",
        value: JSON.stringify(newBoardState),
        session: mySession,
        postId: postId,
      });
    };
    // BOARD STATE LOGIC END

    // BOARD NOTE LOGIC START
    const [isLoadingBoardNotes, setIsLoadingBoardNotes] = useState(false);
    const [boardNotes, setBoardNotes] = useState<string[][][]>([]);

    const redisBoardNotesKey = `${postId}:notes`;

    const updateBoardNotes = (newBoardNotes: string[][][]) => {
      redis.set(redisBoardNotesKey, JSON.stringify(newBoardNotes));
      setBoardNotes(newBoardNotes);
      channel.send({
        name: "notes_set",
        value: JSON.stringify(newBoardNotes),
        session: mySession,
        postId: postId,
      });
    };
    // BOARD NOTE LOGIC END

    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [selectedCell, setSelectedCell] = useState<number[] | null>(null);
    const [isNote, setIsNote] = useState(false);
    const [channelStatus, setChannelStatus] = useState<string[]>([]);
    const [asyncChannelKey, setAsyncChannelKey] = useState(0);

    useAsync(
      async () => {
        const latestBoardRedis =
          (await redis.get(REDIS_LATEST_PUZZLE_KEY)) || "";
        const postUrl = context.postId
          ? (await context.reddit.getPostById(context.postId))?.url
          : "";

        const healthRedis = userId
          ? Number(await redis.zScore("health", userId))
          : null;
        const scoreRedis = userId
          ? (await redis.zScore("score", userId)) || null
          : null;
        if (scoreRedis === null && userId) {
          await redis.zAdd("score", { member: userId, score: 0 });
        }
        if (healthRedis === null && userId) {
          await redis.zAdd("health", { member: userId, score: 3 });
        }

        let boardPuzzleRedis = (await redis.get(`${postId}:puzzle`)) || "";
        const boardSolutionRedis =
          (await redis.get(`${postId}:solution`)) || "";
        const boardStateRedis = (await redis.get(`${postId}:state`)) || "";
        const boardNotesRedis = (await redis.get(`${postId}:notes`)) || "";

        // check that boardPuzzle matches expected state
        if (boardSolutionRedis && boardPuzzleRedis && boardStateRedis) {
          let needsToRewriteBoard = false;
          let result = "";
          // ensure they are all the same length
          if (
            boardSolutionRedis.length === boardPuzzleRedis.length &&
            boardPuzzleRedis.length === boardStateRedis.length
          ) {
            for (let i = 0; i < boardPuzzleRedis.length; i++) {
              // solution check
              const isCellNumberCorrect =
                boardPuzzleRedis[i] === "-"
                  ? true
                  : boardPuzzleRedis[i] === boardSolutionRedis[i];
              // state check
              const isCellStateCorrect =
                boardStateRedis[i] === "1"
                  ? boardPuzzleRedis[i] === boardSolutionRedis[i]
                  : true;
              if (isCellNumberCorrect && isCellStateCorrect) {
                result += boardPuzzleRedis[i];
              } else {
                needsToRewriteBoard = true;
                result += boardSolutionRedis[i];
              }
            }
          }
          if (needsToRewriteBoard && result.length > 0) {
            await redis.set(`${postId}:puzzle`, result);
            boardPuzzleRedis = result;
          }
        }

        return {
          postUrl,
          latestBoardRedis,
          healthRedis,
          scoreRedis,
          boardPuzzleRedis,
          boardSolutionRedis,
          boardStateRedis,
          boardNotesRedis,
        };
      },
      {
        depends: [asyncChannelKey],
        finally: (
          data: {
            postUrl: string;
            latestBoardRedis: string;
            healthRedis: number | null;
            scoreRedis: number | null;
            boardPuzzleRedis: string;
            boardSolutionRedis: string;
            boardStateRedis: string;
            boardNotesRedis: string;
          } | null,
          error
        ) => {
          setChannelStatus((v) => v.concat("async load"));
          if (data === null) {
            return;
          }
          const {
            postUrl,
            latestBoardRedis,
            healthRedis,
            scoreRedis,
            boardPuzzleRedis,
            boardSolutionRedis,
            boardStateRedis,
            boardNotesRedis,
          } = data;
          if (channel.status !== 2 && postUrl === latestBoardRedis) {
            asyncChannelBackup.start();
          }
          setIsLatestBoard(postUrl === latestBoardRedis);
          if (healthRedis !== null && !Number.isNaN(healthRedis)) {
            setHealth(Number(healthRedis));
          }
          if (scoreRedis) {
            setScore(Number(scoreRedis));
          }
          if (boardPuzzleRedis) {
            const puzzleString = boardToString(boardPuzzle);
            const mergedPuzzleString = mergeStrings(
              puzzleString,
              boardPuzzleRedis
            );
            setBoardPuzzle(stringToBoard(mergedPuzzleString));
          }
          if (boardSolutionRedis) {
            setBoardSolution(stringToBoard(boardSolutionRedis));
          }
          if (boardStateRedis) {
            setBoardState(stringToBoard(boardStateRedis));
          }
          if (boardNotesRedis) {
            setBoardNotes(JSON.parse(boardNotesRedis));
          }

          channel.subscribe();
        },
      }
    );

    const channel = useChannel({
      name: context.postId || "sudoku-mountain",
      onMessage: (data: {
        name:
          | "health_set"
          | "score_set"
          | "puzzle_set"
          | "solution_set"
          | "state_set"
          | "notes_set"
          | "new_board_link"
          | "redirect";
        value: string;
        session?: string;
        postId?: string;
        userId?: string;
      }) => {
        if (!data || data.session === mySession || data.postId !== postId) {
          // I am the one that sent the message or the post is not this post
          // do nothing
        } else {
          // I am receiving the message
          if (data.userId === userId) {
            if (data.name === "health_set") {
              setHealth(Number(data.value));
            }
            if (data.name === "score_set") {
              setScore(Number(data.value));
            }
          }
          if (data.name === "puzzle_set") {
            const puzzleString = boardToString(boardPuzzle);
            const newBoard: string[][] = JSON.parse(data.value);
            const newBoardString = boardToString(newBoard);
            const mergedPuzzleString = mergeStrings(
              puzzleString,
              newBoardString
            );
            setBoardPuzzle(stringToBoard(mergedPuzzleString));
          }
          if (data.name === "solution_set") {
            setBoardSolution(JSON.parse(data.value));
          }
          if (data.name === "state_set") {
            setBoardState(JSON.parse(data.value));
          }
          if (data.name === "notes_set") {
            setBoardNotes(JSON.parse(data.value));
          }
        }
        if (data.name === "new_board_link") {
          setIsLatestBoard(false);
        }
      },
      onSubscribed: async () => {
        // handle connection setup
        // setup is latest board
        setChannelStatus((v) => v.concat("onSubscribed"));
        if (isLoadingLatestPuzzleId === false) {
          setIsLoadingLatestPuzzleId(true);
          const latestPuzzle = await redis.get(REDIS_LATEST_PUZZLE_KEY);
          const post = context.postId
            ? await context.reddit.getPostById(context.postId)
            : undefined;
          if (latestPuzzle && latestPuzzle !== post?.url) {
            setIsLatestBoard(false);
          } else {
            setIsLatestBoard(true);
          }
          if (latestPuzzle === null && post?.url) {
            redis.set(REDIS_LATEST_PUZZLE_KEY, post?.url);
          }
        }

        // setup health
        if (isLoadingHealth === false) {
          setIsLoadingHealth(true);
          if (userId) {
            const redisHealthResult = await redis.zScore("health", userId);
            if (redisHealthResult !== undefined) {
              if (Number(redisHealthResult) > 3) {
                updateHealth(3);
              } else {
                updateHealth(Number(redisHealthResult));
              }
            }
          }
        }
        // setup score
        if (isLoadingScore === false) {
          setIsLoadingScore(true);
          if (userId) {
            const redisScoreResult = await redis.zScore("score", userId);
            if (redisScoreResult) {
              if (Number(redisScoreResult) > 0) {
                updateScore(Number(redisScoreResult));
              }
            }
          }
        }
        // setup board puzzle
        if (isLoadingBoardPuzzle === false) {
          setIsLoadingBoardPuzzle(true);
          const redisBoardPuzzleResult = await redis.get(redisBoardPuzzleKey);
          if (redisBoardPuzzleResult !== undefined) {
            updateBoardPuzzle(stringToBoard(redisBoardPuzzleResult));
            setIsLoadingBoardPuzzle(false);
          }
          if (redisBoardPuzzleResult === undefined) {
            // what do if no board?
            const puzzleInfo = getNewPuzzle();
            updateBoardPuzzle(puzzleInfo.currentPuzzle);
            setIsLoadingBoardSolution(true);
            updateBoardSolution(puzzleInfo.currentSolution);
            setIsLoadingBoardState(true);
            updateBoardState(
              puzzleInfo.startingTiles.map((r) =>
                r.map((cell) => (cell ? "1" : "0"))
              )
            );
            setIsLoadingBoardNotes(true);
            updateBoardNotes(puzzleInfo.puzzleNotes);
          }
        }
        // setup board solution
        if (isLoadingBoardSolution === false) {
          setIsLoadingBoardSolution(true);
          const redisBoardSolutionResult = await redis.get(
            redisBoardSolutionKey
          );
          if (redisBoardSolutionResult !== undefined) {
            updateBoardSolution(stringToBoard(redisBoardSolutionResult));
          }
          setIsLoadingBoardSolution(false);
        }
        // setup board state
        if (isLoadingBoardState === false) {
          setIsLoadingBoardState(true);
          const redisBoardStateResult = await redis.get(redisBoardStateKey);
          if (redisBoardStateResult !== undefined) {
            updateBoardState(stringToBoard(redisBoardStateResult));
          }
          setIsLoadingBoardState(false);
        }
        // setup board notes
        if (isLoadingBoardNotes === false) {
          setIsLoadingBoardNotes(true);
          const redisBoardNotesResult = await redis.get(redisBoardNotesKey);
          if (redisBoardNotesResult !== undefined) {
            updateBoardNotes(JSON.parse(redisBoardNotesResult));
          } else {
            updateBoardNotes(getStartingPuzzleNotes());
          }
          setIsLoadingBoardNotes(false);
        }
        setChannelStatus((v) => v.concat("onSubscribed finished"));
      },
      onUnsubscribed: () => {
        // handle network degradation with fallback scenarios
      },
    });
    channel.subscribe();

    // so we run this every 6 seconds, it's slower than the realtime
    //  api, but at least it will pick up client information that
    //  might come from a mobile device or something that doesn't
    //  support the realtime client
    const asyncChannelBackup = useInterval(() => {
      setAsyncChannelKey((ck) => ck + 1);
    }, 6000);

    const addToScore = (amount: number) => {
      updateScore(score + amount);
    };

    if (!userId) {
      return (
        <vstack height="100%" width="100%" alignment="middle center">
          <text size="large">Log into reddit to play Sudoku Mountain!</text>
          <text size="large">
            (at this time we don't support non logged in users, sorry!)
          </text>
        </vstack>
      );
    }

    if (boardPuzzle.length === 0) {
      return (
        <vstack height="100%" width="100%" alignment="middle center">
          <text size="large">Loading ...</text>
        </vstack>
      );
    }

    const handleCellClick = (
      x: number,
      y: number,
      numTest = selectedNumber
    ) => {
      if (channelStatus.length === 0) {
        channel.subscribe();
      }
      const numCount = boardPuzzle.filter((row) =>
        row.includes(String(numTest))
      ).length;
      if (numCount === 9) {
        return;
      }
      if (
        numTest === null &&
        selectedCell?.[0] === x &&
        selectedCell?.[1] === y
      ) {
        setSelectedCell(null);
        return;
      }
      if (numTest === null) {
        setSelectedCell([x, y]);
        return;
      }
      if (boardPuzzle[x][y] !== "-") {
        return;
      }
      if (health <= 0) {
        ui.showToast("Wait until health back up (Every hour, 1 Heart)");
        return;
      }
      if (isNote && boardNotes?.[x]?.[y]?.includes(numTest)) {
        boardNotes[x][y] = boardNotes[x][y].filter(
          (c) => c !== String(numTest)
        );
        updateBoardNotes(boardNotes);
        return;
      }
      if (isNote) {
        boardNotes[x][y].push(String(numTest));
        updateBoardNotes(boardNotes);
        return;
      }
      const updatedBoard = setCellManual(
        x,
        y,
        numTest,
        boardPuzzle,
        boardSolution,
        () => {
          ui.showToast(`${numTest} does not go there!`);
          const mistakeKey = `${x}${y}${numTest}`;
          if (lastMistake !== mistakeKey) {
            decreaseHealth();
          }
          setLastMistake(mistakeKey);
        }
      );
      if (updatedBoard) {
        updateBoardPuzzle(updatedBoard);
        updateBoardNotes(getUpdatePuzzleNotes(boardNotes, x, y, numTest));
        addToScore(10);
        if (numCount === 8) {
          setSelectedNumber(null);
        }
      }
    };

    const leaderboardForm = useForm(
      (data) => {
        const { scores } = data!;
        return {
          fields: [
            ...scores.map((score: { userName: string; score: number }) => ({
              type: "string",
              name: score.userName,
              defaultValue: `${score.userName}: ${score.score}`,
              disabled: true,
            })),
            // Note: We'll populate the rest of the fields dynamically before showing the form
          ],
          title: "Leaderboard (top 10)",
        };
      },
      () => {
        // No submission handling needed
      }
    );

    return (
      <vstack
        height="100%"
        width="100%"
        gap="small"
        alignment="center middle"
        lightBackgroundColor="AlienBlue-100"
        darkBackgroundColor="AlienBlue-900"
      >
        {/* Health & Score */}
        <hstack>
          <hstack
            onPress={async () => {
              const topPlayers = await context.redis.zRange("score", 0, 9, {
                reverse: true,
                by: "rank",
              });
              const scores = [];
              for (let i = 0; i < topPlayers.length; i++) {
                const userName = await getUsernameFromId(
                  topPlayers[i].member,
                  context
                );
                if (userName) {
                  scores.push({ userName, score: topPlayers[i].score });
                }
              }

              // Show the form with the dynamically created fields
              context.ui.showForm(leaderboardForm, {
                scores,
              });
            }}
          >
            <icon name="report-fill" size="small" color="AlienBlue-600"></icon>
            <spacer width="4px"></spacer>
            <text weight="bold">Score: {score}</text>
          </hstack>
          <spacer width={`${size}px`}></spacer>
          <hstack>
            {[...Array(3)].map((__, index) => {
              return (
                <>
                  <spacer width="2px"></spacer>
                  <icon
                    color="AlienBlue-600"
                    name={health > index ? "heart-fill" : "heart-outline"}
                  ></icon>
                </>
              );
            })}
          </hstack>
          <spacer width={`${size}px`}></spacer>
          <hstack
            borderColor="AlienBlue-600"
            cornerRadius="small"
            padding="xsmall"
            onPress={() => {
              setSize(size + 4);
            }}
          >
            <icon name="expand-right" color="AlienBlue-600"></icon>
          </hstack>
          <spacer width="4px"></spacer>
          <hstack
            borderColor="AlienBlue-600"
            cornerRadius="small"
            padding="xsmall"
            onPress={() => {
              setSize(size - 4);
            }}
          >
            <icon name="collapse-right" color="AlienBlue-600"></icon>
          </hstack>
        </hstack>
        {/* Sudoku Grid */}
        <zstack>
          <vstack>
            <hstack>
              {[...Array(9)].map((__, indexX) => {
                return (
                  <>
                    <vstack>
                      {[...Array(9)].map((__, indexY) => {
                        const backgroundColor =
                          selectedCell?.[0] === indexX &&
                          selectedCell?.[1] === indexY
                            ? "LightBlue-100"
                            : selectedCell?.[0] === indexX ||
                              selectedCell?.[1] === indexY
                            ? "LightBlue-50"
                            : "global-white";
                        return (
                          <>
                            <hstack
                              cornerRadius="none"
                              alignment="middle center"
                              height={`${size}px`}
                              width={`${size}px`}
                              border="thin"
                              borderColor="PureGray-300"
                              backgroundColor={backgroundColor}
                              onPress={() => {
                                handleCellClick(indexX, indexY);
                              }}
                            >
                              {boardPuzzle?.[indexX]?.[indexY] === "-" &&
                              boardNotes?.[indexX]?.[indexY].length ? (
                                <vstack padding="none">
                                  {/* render NOTE items */}
                                  <hstack maxHeight="12px" padding="none">
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${1}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      1
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${2}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      2
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${3}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      3
                                    </text>
                                  </hstack>
                                  <hstack maxHeight="12px" padding="none">
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${4}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      4
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${5}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      5
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${6}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      6
                                    </text>
                                  </hstack>
                                  <hstack maxHeight="12px" padding="none">
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${7}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      7
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${8}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      8
                                    </text>
                                    <spacer></spacer>
                                    <text
                                      size="xsmall"
                                      color={
                                        boardNotes[indexX][indexY].includes(
                                          `${9}`
                                        )
                                          ? "PureGray-500"
                                          : backgroundColor
                                      }
                                    >
                                      9
                                    </text>
                                  </hstack>
                                  <spacer height="4px"></spacer>
                                </vstack>
                              ) : (
                                <text
                                  size="xlarge"
                                  weight="bold"
                                  color={
                                    boardState?.[indexX]?.[indexY] === "1"
                                      ? "global-black"
                                      : "AlienBlue-500"
                                  }
                                >
                                  {boardPuzzle?.[indexX]?.[indexY] !== "-"
                                    ? boardPuzzle?.[indexX]?.[indexY]
                                    : ""}
                                </text>
                              )}
                            </hstack>
                          </>
                        );
                      })}
                    </vstack>
                  </>
                );
              })}
              <vstack>
                <spacer height="8px"></spacer>
                <hstack
                  width="8px"
                  height={`${size * 9 - 8}px`}
                  backgroundColor="AlienBlue-600"
                ></hstack>
              </vstack>
            </hstack>
            <hstack>
              <spacer width="8px"></spacer>
              <hstack
                height="8px"
                width={`${size * 9}px`}
                backgroundColor="AlienBlue-600"
              ></hstack>
            </hstack>
          </vstack>
          <hstack border="thin" borderColor="global-black">
            {[...Array(3)].map(() => (
              <vstack>
                {[...Array(3)].map(() => (
                  <hstack
                    width={`${size * 3}px`}
                    height={`${size * 3}px`}
                    border="thin"
                    borderColor="global-black"
                  />
                ))}
              </vstack>
            ))}
          </hstack>
        </zstack>
        {/* Number Buttons */}
        {isLatestBoard && (
          <hstack>
            {[...Array(9)].map((__, index) => {
              const isSelected = selectedNumber === `${index + 1}`;

              return (
                <>
                  <hstack
                    width={`${size}px`}
                    height={`${size - 2}px`}
                    cornerRadius="small"
                    alignment="middle center"
                    backgroundColor={
                      boardPuzzle?.every((row) =>
                        row.includes(String(index + 1))
                      )
                        ? "PureGray-500"
                        : isSelected
                        ? "AlienBlue-800"
                        : "global-white"
                    }
                    borderColor={isSelected ? "global-white" : "global-black"}
                    border="thick"
                    onPress={() => {
                      if (selectedNumber === null && selectedCell === null) {
                        setSelectedNumber(String(index + 1));
                      }
                      if (
                        selectedNumber === String(index + 1) &&
                        selectedCell === null
                      ) {
                        setSelectedNumber(null);
                        return;
                      }
                      if (
                        selectedNumber &&
                        selectedNumber !== String(index + 1) &&
                        selectedCell === null
                      ) {
                        setSelectedNumber(String(index + 1));
                        return;
                      }
                      if (selectedCell) {
                        handleCellClick(
                          selectedCell[0],
                          selectedCell[1],
                          String(index + 1)
                        );
                        return;
                      }
                    }}
                    padding="small"
                  >
                    <text
                      size={isNote ? "xsmall" : "large"}
                      weight="bold"
                      color={isSelected ? "global-white" : "global-black"}
                    >
                      {index + 1}
                    </text>
                  </hstack>
                  <hstack width="2px"></hstack>
                </>
              );
            })}
            {/* Note button */}
            <hstack
              width={`${size + 2}px`}
              height={`${size - 2}px`}
              cornerRadius="small"
              alignment="middle center"
              backgroundColor={isNote ? "global-black" : "global-white"}
              borderColor={isNote ? "global-white" : "global-black"}
              border="thick"
              onPress={() => setIsNote(!isNote)}
            >
              <icon
                size="small"
                name="edit"
                color={isNote ? "global-white" : "global-black"}
              ></icon>
            </hstack>
          </hstack>
        )}
        {isLatestBoard === false && (
          <button
            appearance="primary"
            size="small"
            icon="jump-up"
            onPress={async () => {
              const postUrlResult = await redis.get(REDIS_LATEST_PUZZLE_KEY);
              ui.navigateTo(postUrlResult as string);
            }}
          >
            Go to latest puzzle!
          </button>
        )}
      </vstack>
    );
  },
});

export default Devvit;
