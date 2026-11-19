import React, { useState, useCallback, useMemo, type ReactNode } from "react";
import {
	Box,
	Tooltip,
	Typography,
	Stack,
	alpha,
	useTheme,
	Chip,
	type Theme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HelpIcon from "@mui/icons-material/Help";
import type {
	ProducerConsumerItem,
	CorpMember,
	ProductionSummaryItem,
} from "../types";
import {
	formatExactNumber,
	formatSmartNumber,
	isUserStale,
	extractRecipeMaterials,
} from "../utils";
import MaterialBadge from "../../../cosm/components/materialbadge";

interface DetailTooltipProps {
	children: ReactNode;
	item?: ProductionSummaryItem;
	type?: "prod" | "cons";
	items?: ProducerConsumerItem[];
	title?: string;
	color?: "primary" | "secondary" | "error" | "info" | "success" | "warning";
	totalRaw?: number;
	accurateRaw?: number;
	estimatedRaw?: number;
	theme?: Theme;
	members?: CorpMember[];
	isMobile?: boolean;
	isGridMode?: boolean;
}

/**
 * A custom tooltip that displays detailed breakdown of producers or consumers
 * when hovering over a production value.
 */
export const DetailTooltip = React.memo(
	({
		children,
		item,
		type,
		items: propsItems,
		title: propsTitle,
		color: propsColor,
		totalRaw: propsTotal,
		accurateRaw: propsAccurate,
		estimatedRaw: propsEstimated,
		theme: propTheme,
		members,
	}: DetailTooltipProps) => {
		const muiTheme = useTheme();
		const theme = propTheme || muiTheme;
		const [isOpen, setIsOpen] = useState(false);

		// Resolve values whether using item/type or direct props
		const ticker =
			item?.ticker ||
			(propsTitle && propsTitle.split(" ")[0].length <= 5
				? propsTitle.split(" ")[0]
				: "");
		const isProd = type === "prod" || propsColor === "success";
		const roleLabel = isProd ? "PRODUCERS" : "CONSUMERS";
		const accentColor = isProd ? "#81C784" : "#FF8A80";

		// Sorting state for users & planets
		const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
		// Expanded user company codes (default false like CategoryCard drilldown)
		const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>(
			{},
		);

		const toggleUserExpand = useCallback((player: string) => {
			setExpandedUsers((prev) => ({
				...prev,
				[player]: !(prev[player] ?? false),
			}));
		}, []);

		const items: ProducerConsumerItem[] = useMemo(() => {
			if (propsItems && propsItems.length > 0) return propsItems;
			if (item) {
				return type === "prod" ? item.producers || [] : item.consumers || [];
			}
			return [];
		}, [propsItems, item, type]);

		const totalRaw =
			propsTotal ??
			(item
				? type === "prod"
					? item.productionTotal
					: item.consumptionTotal
				: 0);
		const accurateRaw =
			propsAccurate ??
			(item
				? type === "prod"
					? item.productionAccurate
					: item.consumptionAccurate
				: totalRaw);
		const estimatedRaw =
			propsEstimated ??
			(item
				? type === "prod"
					? item.productionEstimated
					: item.consumptionEstimated
				: 0);

		const isMemberStale = useCallback(
			(name: string) => {
				return members?.some(
					(m: CorpMember) =>
						(m.companyName === name || m.companyCode === name) &&
						isUserStale(m.lastActive),
				);
			},
			[members],
		);

		// Group items by User (player) and attach correlated recipe info per site (computed lazily only when open)
		const userGroups = useMemo(() => {
			if (!isOpen || !items || items.length === 0) return [];

			const userMap = new Map<
				string,
				{
					player: string;
					totalAmount: number;
					batchActive: number;
					batchQueued: number;
					isAccurate: boolean;
					planets: Array<{
						item: ProducerConsumerItem;
						recipes: Array<{
							recipeKey: string;
							building?: string;
							dailyOutput: number;
							dailyCycles: number;
							inputs?: Record<string, number>;
							outputs?: Record<string, number>;
						}>;
					}>;
				}
			>();

			const userRecipes = item?.userRecipesUsed || [];

			const recipeLookup = new Map<
				string,
				Array<{
					recipeKey: string;
					building?: string;
					dailyOutput: number;
					dailyCycles: number;
					inputs?: Record<string, number>;
					outputs?: Record<string, number>;
				}>
			>();

			for (const recipe of userRecipes) {
				if (!recipe.users) continue;

				// Filter recipe role: PRODUCERS must output target item, CONSUMERS must consume target item
				if (item) {
					if (isProd) {
						const outputs =
							(recipe as any).outputs ||
							(recipe.outputTicker
								? { [recipe.outputTicker]: recipe.outputAmount }
								: undefined);
						let matchesOutput = false;
						if (outputs && Object.keys(outputs).length > 0) {
							matchesOutput = Boolean(outputs[item.ticker]);
						} else {
							const arrowIdx = recipe.recipeKey.indexOf("=>");
							if (arrowIdx !== -1) {
								const outPart = recipe.recipeKey.slice(arrowIdx + 2);
								matchesOutput = outPart
									.split("-")
									.some(
										(part) =>
											part.split("x")[1] === item.ticker ||
											part === item.ticker,
									);
							} else {
								matchesOutput = true;
							}
						}
						if (!matchesOutput) continue;
					} else {
						let matchesInput = false;
						if (recipe.inputs && Object.keys(recipe.inputs).length > 0) {
							matchesInput = Boolean(recipe.inputs[item.ticker]);
						} else {
							const colonIdx = recipe.recipeKey.indexOf(":");
							const arrowIdx = recipe.recipeKey.indexOf("=>");
							if (colonIdx !== -1 && arrowIdx !== -1) {
								const inPart = recipe.recipeKey.slice(colonIdx + 1, arrowIdx);
								matchesInput = inPart
									.split("-")
									.some(
										(part) =>
											part.split("x")[1] === item.ticker ||
											part === item.ticker,
									);
							} else {
								matchesInput = true;
							}
						}
						if (!matchesInput) continue;
					}
				}

				for (const user of recipe.users) {
					const key = `${user.player}-${user.loc}`;
					let list = recipeLookup.get(key);
					if (!list) {
						list = [];
						recipeLookup.set(key, list);
					}

					list.push({
						recipeKey: recipe.recipeKey,
						building: recipe.building,
						dailyOutput: user.dailyOutput,
						dailyCycles: user.dailyCycles,
						inputs: recipe.inputs,
						outputs:
							(recipe as any).outputs ||
							(recipe.outputTicker
								? { [recipe.outputTicker]: recipe.outputAmount }
								: undefined),
					});
				}
			}

			items.forEach((i) => {
				let uGroup = userMap.get(i.player);
				if (!uGroup) {
					uGroup = {
						player: i.player,
						totalAmount: 0,
						batchActive: 0,
						batchQueued: 0,
						isAccurate: i.isAccurate,
						planets: [],
					};
					userMap.set(i.player, uGroup);
				}

				uGroup.totalAmount += i.amount;
				const activeBatch = isProd
					? i.batchProdActive || 0
					: i.batchConsActive || 0;
				const queuedBatch = isProd
					? i.batchProdQueued || 0
					: i.batchConsQueued || 0;
				uGroup.batchActive += activeBatch;
				uGroup.batchQueued += queuedBatch;

				const lookupKey = `${i.player}-${i.loc}`;
				const recipes = recipeLookup.get(lookupKey) ?? [];

				uGroup.planets.push({
					item: i,
					recipes: recipes,
				});
			});

			// Sort user groups by total amount according to sortDir
			const groups = Array.from(userMap.values()).sort((a, b) =>
				sortDir === "desc"
					? b.totalAmount - a.totalAmount
					: a.totalAmount - b.totalAmount,
			);

			// Sort planets inside each user group according to sortDir
			groups.forEach((g) => {
				g.planets.sort((a, b) =>
					sortDir === "desc"
						? b.item.amount - a.item.amount
						: a.item.amount - b.item.amount,
				);
			});

			return groups;
		}, [isOpen, items, item?.userRecipesUsed, isProd, sortDir]);

		const content = useMemo(() => {
			if (!isOpen) return null;

			return (
				<Box
					sx={{
						p: 1,
						minWidth: 290,
						maxWidth: 380,
						maxHeight: 450,
						overflowY: "auto",
					}}
				>
					{/* Header bar matching CategoryCard drilldown style */}
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 1,
							mb: 0.75,
							pb: 0.5,
							borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
							{ticker && <MaterialBadge ticker={ticker} />}
							<Typography
								variant="caption"
								sx={{
									fontSize: "0.75rem",
									color: accentColor,
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									fontWeight: 500,
								}}
							>
								{roleLabel}
							</Typography>
							<Typography
								variant="caption"
								sx={{
									fontSize: "0.7rem",
									color: "text.secondary",
									px: 0.6,
									py: 0.1,
									borderRadius: 1,
									bgcolor: "rgba(255, 255, 255, 0.05)",
								}}
							>
								{userGroups.length}
							</Typography>
						</Box>

						{/* Action Buttons: Expand All & Sort */}
						<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
							<Box
								component="button"
								onClick={() => {
									const anyExpanded = userGroups.some(
										(g) => expandedUsers[g.player] ?? false,
									);
									const nextState = !anyExpanded;
									const updated: Record<string, boolean> = {};
									userGroups.forEach((g) => {
										updated[g.player] = nextState;
									});
									setExpandedUsers(updated);
								}}
								sx={{
									background: "none",
									border: "1px solid rgba(255, 255, 255, 0.1)",
									borderRadius: 1,
									color: "text.secondary",
									fontSize: "0.65rem",
									px: 0.6,
									py: 0.2,
									cursor: "pointer",
									"&:hover": {
										color: "text.primary",
										bgcolor: "rgba(255,255,255,0.05)",
									},
								}}
							>
								{userGroups.some((g) => expandedUsers[g.player] ?? false)
									? "Collapse all"
									: "Expand all"}
							</Box>

							<Box
								component="button"
								onClick={() =>
									setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
								}
								sx={{
									background: "none",
									border: "1px solid rgba(255, 255, 255, 0.1)",
									borderRadius: 1,
									color: "text.secondary",
									fontSize: "0.65rem",
									px: 0.6,
									py: 0.2,
									cursor: "pointer",
									"&:hover": {
										color: "text.primary",
										bgcolor: "rgba(255,255,255,0.05)",
									},
								}}
							>
								{sortDir === "desc" ? "Highest" : "Lowest"}
							</Box>
						</Box>
					</Box>

					{/* Users List */}
					<Stack spacing={0.4}>
						{userGroups.length > 0 ? (
							userGroups.map((uGroup) => {
								const stale = isMemberStale(uGroup.player);
								const isExpanded = expandedUsers[uGroup.player] ?? false;

								return (
									<Box
										key={uGroup.player}
										sx={{
											borderRadius: 1,
											bgcolor: "rgba(255, 255, 255, 0.02)",
											border: "1px solid rgba(255, 255, 255, 0.05)",
											overflow: "hidden",
										}}
									>
										{/* User Accordion Header */}
										<Box
											onClick={() => toggleUserExpand(uGroup.player)}
											sx={{
												py: 0.4,
												px: 0.75,
												bgcolor: isExpanded
													? "rgba(255, 255, 255, 0.04)"
													: "transparent",
												cursor: "pointer",
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												userSelect: "none",
												"&:hover": { bgcolor: "rgba(255, 255, 255, 0.06)" },
											}}
										>
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 0.75,
													minWidth: 0,
												}}
											>
												<Typography
													variant="caption"
													noWrap
													sx={{
														color: stale ? "warning.main" : "text.primary",
														fontSize: "0.75rem",
														fontWeight: 500,
													}}
												>
													{uGroup.player}
												</Typography>
												<Typography
													variant="caption"
													sx={{
														fontSize: "0.65rem",
														color: "text.secondary",
													}}
												>
													{uGroup.planets.length} site
													{uGroup.planets.length > 1 ? "s" : ""}
												</Typography>
											</Box>

											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 0.75,
												}}
											>
												{(uGroup.batchActive > 0 || uGroup.batchQueued > 0) && (
													<Typography
														variant="caption"
														sx={{
															fontSize: "0.65rem",
															color: "#FFB74D",
														}}
													>
														+{Math.round(uGroup.batchActive)}
														{uGroup.batchQueued > 0
															? ` (${Math.round(uGroup.batchQueued)})`
															: ""}
													</Typography>
												)}
												<Typography
													variant="caption"
													sx={{
														color: accentColor,
														fontSize: "0.75rem",
														fontWeight: 500,
													}}
												>
													{formatSmartNumber(uGroup.totalAmount)}
												</Typography>
												<Typography
													variant="caption"
													sx={{
														color: "text.secondary",
														fontSize: "0.6rem",
														width: 10,
														textAlign: "center",
													}}
												>
													{isExpanded ? "▲" : "▼"}
												</Typography>
											</Box>
										</Box>

										{/* Sites Details */}
										{isExpanded && (
											<Stack
												spacing={0.3}
												sx={{
													p: 0.5,
													pt: 0.3,
													borderTop: "1px solid rgba(255, 255, 255, 0.04)",
												}}
											>
												{uGroup.planets.map(
													({ item: pItem, recipes }, pIdx) => {
														const bActive = isProd
															? pItem.batchProdActive || 0
															: pItem.batchConsActive || 0;
														const bQueued = isProd
															? pItem.batchProdQueued || 0
															: pItem.batchConsQueued || 0;

														return (
															<Box
																key={pIdx}
																sx={{
																	p: 0.4,
																	px: 0.6,
																	borderRadius: 0.75,
																	bgcolor: "rgba(0, 0, 0, 0.25)",
																}}
															>
																<Box
																	sx={{
																		display: "flex",
																		justifyContent: "space-between",
																		alignItems: "center",
																	}}
																>
																	<Typography
																		variant="caption"
																		sx={{
																			color: "text.secondary",
																			fontSize: "0.7rem",
																		}}
																	>
																		{pItem.loc}
																	</Typography>
																	<Box
																		sx={{
																			display: "flex",
																			alignItems: "center",
																			gap: 0.5,
																		}}
																	>
																		{(bActive > 0 || bQueued > 0) && (
																			<Typography
																				variant="caption"
																				sx={{
																					fontSize: "0.62rem",
																					color: "#FFB74D",
																				}}
																			>
																				+{Math.round(bActive)}
																				{bQueued > 0
																					? ` (${Math.round(bQueued)})`
																					: ""}
																			</Typography>
																		)}
																		<Typography
																			variant="caption"
																			sx={{
																				color: accentColor,
																				fontSize: "0.72rem",
																			}}
																		>
																			{formatSmartNumber(pItem.amount)}
																		</Typography>
																	</Box>
																</Box>

																{recipes.length > 0 && (
																	<Stack
																		spacing={0.2}
																		sx={{
																			mt: 0.25,
																			pt: 0.25,
																			borderTop:
																				"1px solid rgba(255, 255, 255, 0.03)",
																		}}
																	>
																		{recipes.map((rec, rIdx) => {
																			const {
																				inputMaterials,
																				outputMaterials,
																			} = extractRecipeMaterials(
																				rec.inputs,
																				(rec as any).outputs,
																			);

																			return (
																				<Box
																					key={rIdx}
																					sx={{
																						display: "flex",
																						alignItems: "center",
																						justifyContent: "space-between",
																						gap: 0.5,
																						flexWrap: "wrap",
																					}}
																				>
																					{/* Formula Row with Building tag & MaterialBadges */}
																					<Box
																						sx={{
																							display: "flex",
																							alignItems: "center",
																							gap: 0.3,
																							flexWrap: "wrap",
																							minWidth: 0,
																							transform: "scale(0.88)",
																							transformOrigin: "left center",
																						}}
																					>
																						{rec.building && (
																							<Typography
																								variant="caption"
																								sx={{
																									fontWeight: 800,
																									color: "#BA68C8",
																									fontSize: "0.58rem",
																									mr: 0.1,
																								}}
																							>
																								{rec.building}:
																							</Typography>
																						)}
																						{inputMaterials.map((inp, idx) => (
																							<Box
																								key={inp.ticker}
																								sx={{
																									display: "inline-flex",
																									alignItems: "center",
																									gap: 0.15,
																								}}
																							>
																								{idx > 0 && (
																									<Typography
																										variant="caption"
																										sx={{
																											color:
																												"rgba(186, 104, 200, 0.7)",
																											fontWeight: 800,
																											fontSize: "0.55rem",
																											px: 0.05,
																										}}
																									>
																										+
																									</Typography>
																								)}
																								<MaterialBadge
																									ticker={inp.ticker}
																								/>
																								<Typography
																									variant="caption"
																									sx={{
																										color:
																											"rgba(255,255,255,0.65)",
																										fontSize: "0.55rem",
																										fontWeight: 700,
																									}}
																								>
																									{inp.factor < 1
																										? inp.factor.toFixed(1)
																										: Math.round(inp.factor)}
																									/d
																								</Typography>
																							</Box>
																						))}

																						{outputMaterials.length > 0 && (
																							<>
																								<Typography
																									variant="caption"
																									sx={{
																										color: "#BA68C8",
																										fontWeight: 800,
																										fontSize: "0.55rem",
																										px: 0.15,
																									}}
																								>
																									➔
																								</Typography>
																								{outputMaterials.map(
																									(out, idx) => (
																										<Box
																											key={out.ticker}
																											sx={{
																												display: "inline-flex",
																												alignItems: "center",
																												gap: 0.15,
																											}}
																										>
																											{idx > 0 && (
																												<Typography
																													variant="caption"
																													sx={{
																														color:
																															"rgba(186, 104, 200, 0.7)",
																														fontWeight: 800,
																														fontSize: "0.55rem",
																														px: 0.05,
																													}}
																												>
																													+
																												</Typography>
																											)}
																											<MaterialBadge
																												ticker={out.ticker}
																											/>
																											<Typography
																												variant="caption"
																												sx={{
																													color: "#64FFDA",
																													fontSize: "0.55rem",
																													fontWeight: 700,
																												}}
																											>
																												{out.factor < 1
																													? out.factor.toFixed(
																															1,
																														)
																													: Math.round(
																															out.factor,
																														)}
																												/d
																											</Typography>
																										</Box>
																									),
																								)}
																							</>
																						)}
																					</Box>

																					<Typography
																						variant="caption"
																						sx={{
																							color: "rgba(255,255,255,0.5)",
																							fontSize: "0.55rem",
																							ml: "auto",
																							whiteSpace: "nowrap",
																						}}
																					>
																						{formatSmartNumber(rec.dailyOutput)}
																						/d ({rec.dailyCycles.toFixed(
																							1,
																						)}{" "}
																						cyc)
																					</Typography>
																				</Box>
																			);
																		})}
																	</Stack>
																)}
															</Box>
														);
													},
												)}
											</Stack>
										)}
									</Box>
								);
							})
						) : (
							<Typography
								variant="caption"
								sx={{
									fontStyle: "italic",
									color: "rgba(255,255,255,0.4)",
									textAlign: "center",
									py: 1,
								}}
							>
								No active entries
							</Typography>
						)}
					</Stack>
				</Box>
			);
		}, [
			isOpen,
			items,
			ticker,
			roleLabel,
			userGroups,
			accentColor,
			sortDir,
			expandedUsers,
			toggleUserExpand,
			isMemberStale,
			isProd,
		]);

		return (
			<Tooltip
				arrow
				placement="top"
				title={content || ""}
				onOpen={() => setIsOpen(true)}
				onClose={() => setIsOpen(false)}
				slotProps={{
					tooltip: {
						sx: {
							bgcolor: "#06060e",
							backdropFilter: "blur(16px)",
							WebkitBackdropFilter: "blur(16px)",
							border: "1px solid rgba(123, 104, 238, 0.2)",
							boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)",
							borderRadius: 2,
							p: 0,
							"& ::-webkit-scrollbar": {
								width: "4px",
							},
							"& ::-webkit-scrollbar-track": {
								background: "rgba(0, 0, 0, 0.2)",
							},
							"& ::-webkit-scrollbar-thumb": {
								background: "rgba(123, 104, 238, 0.4)",
								borderRadius: "4px",
								"&:hover": {
									background: "rgba(123, 104, 238, 0.7)",
								},
							},
						},
					},
					arrow: {
						sx: {
							color: "#06060e",
							"&::before": {
								border: "1px solid rgba(123, 104, 238, 0.2)",
							},
						},
					},
				}}
			>
				<Box sx={{ cursor: "pointer", width: "100%" }}>{children}</Box>
			</Tooltip>
		);
	},
);
